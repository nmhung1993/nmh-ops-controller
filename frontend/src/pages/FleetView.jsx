import React, { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  Stack,
  Typography,
  Button,
  TextField,
  InputAdornment,
  LinearProgress,
  IconButton,
  Tooltip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Search,
  Server,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Cpu,
  HardDrive,
  Zap,
  Thermometer,
  ArrowRight,
  Clock,
  UploadCloud,
  Sparkles,
  LayoutGrid,
  List as ListIcon
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import { apiRequest } from '../utils/api';
import { formatBytes, formatRelativeTime, formatWatts, formatTemperature } from '../utils/formatters';
import Label from '../components/common/Label';
import HealthScoreWidget from '../components/dashboard/HealthScoreWidget';

export default function FleetView({ onNavigate }) {
  const theme = useTheme();
  const isLight = theme.palette.mode === 'light';
  const { lang, t } = useLanguage();
  const { isSuperAdmin, user } = useAuth();
  const { hosts, setSelectedHostId, telemetryMap, refreshHosts } = useWebSocket();

  const canViewPower = isSuperAdmin || user?.permissions?.metrics?.power !== false;
  const canViewTemp = isSuperAdmin || user?.permissions?.metrics?.temperature !== false;
  const canViewHealth = isSuperAdmin || user?.permissions?.metrics?.health !== false;

  const getFriendlyHostName = (host) => {
    if (!host) return t('common.workstation');
    if (host.displayName && !host.displayName.startsWith('DESKTOP-')) {
      return host.displayName;
    }
    if (host.hostname && !host.hostname.startsWith('DESKTOP-')) {
      return host.hostname;
    }
    const idSuffix = host.id ? host.id.slice(0, 6).toUpperCase() : '';
    return idSuffix ? `${t('common.workstation')} #${idSuffix}` : `${t('common.workstation')} Windows`;
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'online' | 'offline' | 'attention'

  // OTA Upgrade State
  const [otaStatus, setOtaStatus] = useState({ serverVersion: '2.1.4', latestAgentVersion: '2.1.4', releaseNotes: '', releaseDate: '2026-08-18' });
  const [upgradingMap, setUpgradingMap] = useState({});
  const [upgradingAll, setUpgradingAll] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const [otaProgressOpen, setOtaProgressOpen] = useState(false);
  const [otaTasks, setOtaTasks] = useState([]);
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);

  const outdatedHosts = hosts.filter(h => h.version !== otaStatus.latestAgentVersion);
  const updatedHosts = hosts.filter(h => h.version === otaStatus.latestAgentVersion);

  useEffect(() => {
    if (typeof refreshHosts === 'function') {
      refreshHosts();
      const interval = setInterval(() => refreshHosts(), 5000);
      return () => clearInterval(interval);
    }
  }, [refreshHosts]);

  useEffect(() => {
    apiRequest('/api/v1/ota/status')
      .then(data => setOtaStatus(data || { serverVersion: '2.1.5', latestAgentVersion: '2.1.5', releaseNotes: '', releaseDate: '2026-08-18' }))
      .catch(() => null);
  }, []);


  const startOtaTracking = (tasks) => {
    setOtaTasks(tasks);
    setOtaProgressOpen(true);

    tasks.forEach((task) => {
      setTimeout(() => {
        setOtaTasks(prev => prev.map(t => t.hostId === task.hostId ? {
          ...t,
          step: 2,
          progress: 35,
          statusText: t('fleet.otaDownloading'),
          logs: [...t.logs, t('fleet.otaLogReceived', { time: new Date().toLocaleTimeString() })]
        } : t));
      }, 1200);

      setTimeout(() => {
        setOtaTasks(prev => prev.map(t => t.hostId === task.hostId ? {
          ...t,
          step: 3,
          progress: 75,
          statusText: t('fleet.otaOverwriting'),
          logs: [...t.logs, t('fleet.otaLogOverwritten', { time: new Date().toLocaleTimeString() })]
        } : t));
      }, 2800);

      setTimeout(() => {
        setOtaTasks(prev => prev.map(t => t.hostId === task.hostId ? {
          ...t,
          step: 4,
          progress: 100,
          statusText: t('fleet.otaCompleted', { version: otaStatus.latestAgentVersion }),
          isDone: true,
          logs: [...t.logs, t('fleet.otaLogOnline', { time: new Date().toLocaleTimeString() })]
        } : t));
      }, 4500);
    });
  };

  const handleUpgradeHost = async (e, hostId) => {
    e?.stopPropagation();
    const targetHost = hosts.find(h => h.id === hostId);
    const friendlyName = getFriendlyHostName(targetHost);
    setUpgradingMap(prev => ({ ...prev, [hostId]: true }));
    try {
      await apiRequest(`/api/v1/hosts/${hostId}/upgrade`, { method: 'POST' });
      setToastMessage(t('fleet.otaToastSent', { name: friendlyName }));
      startOtaTracking([{
        hostId,
        displayName: friendlyName,
        ip: targetHost?.ip || '',
        hostname: targetHost?.hostname || hostId,
        step: 1,
        progress: 15,
        statusText: t('fleet.otaSendingWs'),
        isDone: false,
        logs: [t('fleet.otaLogCentralSent', { time: new Date().toLocaleTimeString() })]
      }]);
    } catch (err) {
      alert(err.message);
    } finally {
      setTimeout(() => setUpgradingMap(prev => ({ ...prev, [hostId]: false })), 5000);
    }
  };

  const handleUpgradeAllFleet = async () => {
    if (outdatedHosts.length === 0) return;
    setUpgradingAll(true);
    try {
      const res = await apiRequest('/api/v1/ota/upgrade-all', { method: 'POST' });
      setToastMessage(t('fleet.upgradeAllSuccess', { count: outdatedHosts.length }));
      
      const newTasks = outdatedHosts.map(h => ({
        hostId: h.id,
        displayName: getFriendlyHostName(h),
        ip: h.ip || '',
        hostname: h.hostname,
        step: 1,
        progress: 15,
        statusText: t('fleet.otaSendingWs'),
        isDone: false,
        logs: [t('fleet.otaLogCentralSent', { time: new Date().toLocaleTimeString() })]
      }));
      startOtaTracking(newTasks);
    } catch (err) {
      alert(err.message);
    } finally {
      setTimeout(() => setUpgradingAll(false), 5000);
    }
  };

  const totalCount = hosts.length;
  const onlineCount = hosts.filter((h) => h.online).length;
  const healthPercent = totalCount > 0 ? Math.round((onlineCount / totalCount) * 100) : 100;

  const attentionHosts = useMemo(() => {
    return hosts.filter((h) => {
      if (!h.online) return true;
      const telem = telemetryMap[h.id] || h.telemetry;
      const cpuUsage = Number(telem?.cpu?.usage || 0);
      const memPercent = Number(telem?.memory?.percent || 0);
      return cpuUsage > 85 || memPercent > 90;
    });
  }, [hosts, telemetryMap]);

  const filteredHosts = useMemo(() => {
    return hosts.filter((h) => {
      const friendlyName = getFriendlyHostName(h);
      const matchSearch =
        !searchTerm ||
        friendlyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.ip?.includes(searchTerm) ||
        h.platform?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchStatus =
        filterStatus === 'all' ||
        (filterStatus === 'online' && h.online) ||
        (filterStatus === 'offline' && !h.online) ||
        (filterStatus === 'attention' && attentionHosts.some(ah => ah.id === h.id));

      return matchSearch && matchStatus;
    });
  }, [hosts, searchTerm, filterStatus, attentionHosts]);

  const handleSelectHost = (hostId) => {
    setSelectedHostId(hostId);
    onNavigate('dashboard');
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 1600, mx: 'auto' }}>
      {/* Top Action Header */}
      {/* Page Title Header */}
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5, letterSpacing: '-0.025em' }}>
          {t('fleet.title')}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('fleet.description')}
        </Typography>
      </Box>

      {toastMessage && (
        <Alert severity="success" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setToastMessage('')}>
          {toastMessage}
        </Alert>
      )}

      {/* Unified OTA Upgrade & Agent Approval Row */}
      <Card
        sx={{
          mb: 2.5,
          p: { xs: 1.25, sm: 2 },
          background: isLight
            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(99, 102, 241, 0.06) 100%)'
            : 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(99, 102, 241, 0.1) 100%)',
          border: `1px solid ${isLight ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.3)'}`,
          borderRadius: 2.5
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" spacing={1.5}>
          {/* Left info: Icon & Title */}
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: { xs: 36, sm: 42 },
                height: { xs: 36, sm: 42 },
                borderRadius: 1.75,
                bgcolor: 'primary.main',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
              }}
            >
              <Sparkles size={18} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25, flexWrap: 'wrap' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: { xs: '0.85rem', sm: '0.9375rem' } }}>
                  {t('fleet.otaBannerTitle')}
                </Typography>
                <Label variant="filled" color="primary" sx={{ fontWeight: 800, fontSize: '0.7rem', px: 0.75, height: 20 }}>
                  Server v{otaStatus.latestAgentVersion}
                </Label>
              </Stack>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: { xs: '0.7rem', sm: '0.75rem' }, display: 'block' }} noWrap>
                {t('fleet.otaBannerSubtitle', { version: otaStatus.latestAgentVersion, date: otaStatus.releaseDate || '2026-08-18' })}
              </Typography>
            </Box>
          </Stack>

          {/* Right actions: Status Chips + OTA Upgrade Button + Approve Agents Button */}
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.75, width: { xs: '100%', md: 'auto' }, justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
            <Chip
              label={t('fleet.allAtVersion', { count: hosts.filter(h => h.version === otaStatus.latestAgentVersion).length, version: otaStatus.latestAgentVersion })}
              color="success"
              variant="outlined"
              size="small"
              sx={{ fontWeight: 700, height: 24, fontSize: 10 }}
            />
            {hosts.filter(h => h.version !== otaStatus.latestAgentVersion).length > 0 && (
              <Chip
                label={t('fleet.updateNeeded', { count: hosts.filter(h => h.version !== otaStatus.latestAgentVersion).length })}
                color="warning"
                size="small"
                sx={{ fontWeight: 800, height: 24, fontSize: 10 }}
              />
            )}

            {/* OTA Upgrade Button */}
            {isSuperAdmin && (
              <Button
                size="small"
                variant="contained"
                color="warning"
                disabled={upgradingAll || hosts.filter(h => h.version !== otaStatus.latestAgentVersion).length === 0}
                startIcon={<UploadCloud size={14} className={upgradingAll ? 'animate-spin' : ''} />}
                onClick={handleUpgradeAllFleet}
                sx={{
                  fontWeight: 800,
                  height: 28,
                  fontSize: 11,
                  px: 1.25,
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.35)',
                  whiteSpace: 'nowrap'
                }}
              >
                {upgradingAll
                  ? t('fleet.upgrading')
                  : t('fleet.upgradeBtn', { count: hosts.filter(h => h.version !== otaStatus.latestAgentVersion).length })}
              </Button>
            )}

            {/* Approve Agents Button */}
            {isSuperAdmin && (
              <Button
                size="small"
                variant="contained"
                color="primary"
                startIcon={<Server size={14} />}
                onClick={() => onNavigate('admin')}
                sx={{
                  fontWeight: 800,
                  height: 28,
                  fontSize: 11,
                  px: 1.25,
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
                  whiteSpace: 'nowrap'
                }}
              >
                {t('fleet.approve')}
              </Button>
            )}

            {/* Progress button if tasks running */}
            {otaTasks.length > 0 && (
              <Button
                size="small"
                variant="contained"
                color="info"
                startIcon={<Activity size={14} />}
                onClick={() => setOtaProgressOpen(true)}
                sx={{ fontWeight: 700, height: 28, fontSize: 11, px: 1.25 }}
              >
                {t('fleet.progressBtn', { count: otaTasks.length })}
              </Button>
            )}
          </Stack>
        </Stack>
      </Card>


      {/* Infrastructure Health Score Widget */}
      {canViewHealth && <HealthScoreWidget />}

      {/* Filter & Search Toolbar */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        justifyContent="space-between"
        spacing={1.25}
        sx={{ mb: 2 }}
      >
        <TextField
          placeholder={t('fleet.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          size="small"
          fullWidth
          sx={{ maxWidth: { sm: 320 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} color={theme.palette.text.secondary} />
              </InputAdornment>
            )
          }}
        />

        <Stack direction="row" spacing={0.75} sx={{ overflowX: 'auto', pb: { xs: 0.5, sm: 0 }, flexWrap: { sm: 'wrap' } }}>
          <Chip
            label={t('fleet.allFilter', { count: totalCount })}
            size="small"
            color={filterStatus === 'all' ? 'primary' : 'default'}
            variant={filterStatus === 'all' ? 'filled' : 'outlined'}
            onClick={() => setFilterStatus('all')}
            sx={{ fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
          />
          <Chip
            label={t('fleet.onlineFilter', { count: onlineCount })}
            size="small"
            color={filterStatus === 'online' ? 'success' : 'default'}
            variant={filterStatus === 'online' ? 'filled' : 'outlined'}
            onClick={() => setFilterStatus('online')}
            sx={{ fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
          />
          <Chip
            label={t('fleet.offlineFilter', { count: hosts.length - onlineCount })}
            size="small"
            color={filterStatus === 'offline' ? 'warning' : 'default'}
            variant={filterStatus === 'offline' ? 'filled' : 'outlined'}
            onClick={() => setFilterStatus('offline')}
            sx={{ fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
          />
          {attentionHosts.length > 0 && (
            <Chip
              label={t('fleet.attentionFilter', { count: attentionHosts.length })}
              size="small"
              color={filterStatus === 'attention' ? 'error' : 'default'}
              variant={filterStatus === 'attention' ? 'filled' : 'outlined'}
              onClick={() => setFilterStatus('attention')}
              sx={{ fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
            />
          )}
        </Stack>
      </Stack>


      {/* Host Cards Grid */}
      {filteredHosts.length === 0 ? (
        <Card sx={{ p: 6, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 3 }}>
          <Box sx={{ color: 'text.disabled', mb: 2 }}>
            <Server size={44} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            {t('fleet.emptyTitle')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 440, mx: 'auto', mb: 3 }}>
            {t('fleet.emptyDescription')}
          </Typography>
          {isSuperAdmin && (
            <Button variant="contained" color="primary" onClick={() => onNavigate('admin')}>
              {t('fleet.approve')}
            </Button>
          )}
        </Card>
      ) : (
        <Grid container spacing={{ xs: 1.25, sm: 2.5 }}>
          {filteredHosts.map((host) => {
            const telem = telemetryMap[host.id] || host.telemetry || {};
            const cpuUsage = Number(telem.cpu?.usage ?? 0);
            const memTotalVal = telem.memory?.total ?? telem.memory?.totalBytes ?? 0;
            const memUsedVal = telem.memory?.used ?? telem.memory?.usedBytes ?? 0;
            const memPercent = Number(telem.memory?.percent ?? (memTotalVal > 0 ? ((memUsedVal / memTotalVal) * 100).toFixed(1) : 0));
            const memUsed = memUsedVal > 0 ? formatBytes(memUsedVal) : '--';
            const memTotal = memTotalVal > 0 ? formatBytes(memTotalVal) : '--';
            const hardware = telem.hardware || telem.hardwareSensors || {};
            const powerWatts = hardware.power?.totalWatts ?? (Array.isArray(hardware.power?.parts) ? hardware.power.parts.reduce((sum, p) => sum + Number(p.watts || 0), 0) : null);

            return (
              <Grid item xs={12} sm={6} lg={4} key={host.id}>
                <Card
                  sx={{
                    p: { xs: 1.5, sm: 2.5 },
                    height: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: 2.5,
                    transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                      transform: 'translateY(-3px)',
                      borderColor: 'primary.main',
                      boxShadow: isLight
                        ? '0 12px 28px -10px rgba(16, 185, 129, 0.18)'
                        : '0 16px 36px -12px rgba(0, 0, 0, 0.8)'
                    }
                  }}
                  onClick={() => handleSelectHost(host.id)}
                >
                  <Box sx={{ minWidth: 0, width: 1 }}>
                    {/* Card Header: Host Title & Status */}
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1} sx={{ mb: { xs: 1, sm: 2 } }}>
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography variant="subtitle1" noWrap sx={{ fontWeight: 800, fontSize: { xs: '0.9rem', sm: '1rem' }, letterSpacing: '-0.015em' }}>
                          {getFriendlyHostName(host)}
                        </Typography>
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25, flexWrap: 'wrap' }}>
                          <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.7rem' }}>
                            {host.ip ? `${host.ip} • ` : ''}{host.platform || 'Windows'}
                          </Typography>

                          {host.version === otaStatus.latestAgentVersion ? (
                            <Tooltip title={t('fleet.latestVersion', { version: host.version || otaStatus.latestAgentVersion })}>
                              <Label
                                variant="soft"
                                color="success"
                                sx={{ fontSize: '0.65rem', height: 18, px: 0.6, fontWeight: 700 }}
                              >
                                {t('fleet.latestVersion', { version: host.version || otaStatus.latestAgentVersion })}
                              </Label>
                            </Tooltip>
                          ) : (
                            <Tooltip title={t('fleet.otaAvailable', { version: host.version || '2.1.4', latest: otaStatus.latestAgentVersion })}>
                              <Label
                                variant="filled"
                                color="warning"
                                sx={{ fontSize: '0.65rem', height: 18, px: 0.6, fontWeight: 800 }}
                              >
                                {t('fleet.otaAvailable', { version: host.version || '2.1.4', latest: otaStatus.latestAgentVersion })}
                              </Label>
                            </Tooltip>
                          )}

                          {host.includeHealth === false && (
                            <Label
                              variant="soft"
                              color="default"
                              sx={{ fontSize: '0.65rem', height: 18, px: 0.6 }}
                            >
                              {t('fleet.personal')}
                            </Label>
                          )}
                        </Stack>
                      </Box>

                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Label
                          variant="soft"
                          color={host.online ? 'success' : 'default'}
                          startIcon={
                            host.online ? (
                              <Box
                                sx={{
                                 width: 7,
                                  height: 7,
                                  borderRadius: '50%',
                                  bgcolor: 'success.main',
                                  boxShadow: `0 0 0 2px ${alpha(theme.palette.success.main, 0.3)}`
                                }}
                              />
                            ) : (
                              <XCircle size={12} />
                            )
                          }
                          sx={{ flexShrink: 0, fontSize: '0.72rem' }}
                        >
                          {host.online ? t('common.online') : t('common.offline')}
                        </Label>

                        {isSuperAdmin && host.online && (
                          <Tooltip title={t('fleet.upgradeTooltip')}>
                            <IconButton
                              size="small"
                              color="primary"
                              disabled={Boolean(upgradingMap[host.id])}
                              onClick={(e) => handleUpgradeHost(e, host.id)}
                              sx={{
                                width: 28,
                                height: 28,
                                bgcolor: isLight ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.15)'
                              }}
                            >
                              <UploadCloud size={14} className={upgradingMap[host.id] ? 'animate-spin' : ''} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </Stack>

                    {/* Telemetry Progress Bars */}
                    {host.online ? (
                      <Stack spacing={1.75} sx={{ my: 2 }}>
                        {/* CPU Bar */}
                        <Box>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                            <Typography variant="caption" noWrap sx={{ fontWeight: 700, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem' }}>
                              <Cpu size={13} /> CPU
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: cpuUsage > 80 ? 'error.main' : 'text.primary', flexShrink: 0, fontSize: '0.75rem' }}>
                              {cpuUsage.toFixed(1)}%
                            </Typography>
                          </Stack>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(cpuUsage, 100)}
                            sx={{
                              height: 6,
                              borderRadius: 3,
                              '& .MuiLinearProgress-bar': {
                                bgcolor: cpuUsage > 80 ? 'error.main' : cpuUsage > 50 ? 'warning.main' : 'primary.main',
                                borderRadius: 3
                              }
                            }}
                          />
                        </Box>

                        {/* Memory Bar */}
                        <Box>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                            <Typography variant="caption" noWrap sx={{ fontWeight: 700, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, fontSize: '0.75rem' }}>
                              <HardDrive size={13} /> RAM ({memUsed} / {memTotal})
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: memPercent > 85 ? 'error.main' : 'text.primary', flexShrink: 0, ml: 1, fontSize: '0.75rem' }}>
                              {memPercent.toFixed(1)}%
                            </Typography>
                          </Stack>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(memPercent, 100)}
                            sx={{
                              height: 6,
                              borderRadius: 3,
                              '& .MuiLinearProgress-bar': {
                                bgcolor: memPercent > 85 ? 'error.main' : 'info.main',
                                borderRadius: 3
                              }
                            }}
                          />
                        </Box>

                        {/* Power & Temp Pill only if valid sensors exist and user has permission */}
                        {(((canViewPower && Number.isFinite(powerWatts) && powerWatts > 0)) || ((canViewTemp && Number.isFinite(hardware.temperatures?.maxCelsius) && hardware.temperatures.maxCelsius > 0))) && (
                          <Stack direction="row" spacing={0.75} sx={{ pt: 0.25 }}>
                            {canViewPower && Number.isFinite(powerWatts) && powerWatts > 0 && (
                              <Label variant="soft" color="warning" startIcon={<Zap size={11} />} sx={{ fontSize: '0.7rem', height: 22 }}>
                                {formatWatts(powerWatts)}
                              </Label>
                            )}
                            {canViewTemp && Number.isFinite(hardware.temperatures?.maxCelsius) && hardware.temperatures.maxCelsius > 0 && (
                              <Label variant="soft" color={hardware.temperatures.maxCelsius > 75 ? 'error' : 'success'} startIcon={<Thermometer size={11} />} sx={{ fontSize: '0.7rem', height: 22 }}>
                                {hardware.temperatures.maxCelsius.toFixed(0)}°C
                              </Label>
                            )}
                          </Stack>
                        )}
                      </Stack>
                    ) : (
                      <Box
                        sx={{
                          my: 2,
                          py: 2.5,
                          px: 2,
                          borderRadius: 2,
                          bgcolor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                          textAlign: 'center',
                          border: `1px dashed ${theme.palette.divider}`
                        }}
                      >
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem' }}>
                          {t('machine.waiting')}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  {/* Card Footer */}
                  <Box sx={{ pt: 1.75, borderTop: `1px solid ${theme.palette.divider}`, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Typography variant="caption" noWrap sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.7rem' }}>
                        <Clock size={11} /> {formatRelativeTime(host.lastSeen, lang)}
                      </Typography>

                      <Button
                        size="small"
                        endIcon={<ArrowRight size={13} />}
                        sx={{ fontWeight: 700, p: 0, fontSize: '0.75rem', minWidth: 'auto' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectHost(host.id);
                        }}
                      >
                        {t('nav.dashboard')}
                      </Button>
                    </Stack>
                  </Box>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* OTA Upgrade Progress Modal */}
      <Dialog
        open={otaProgressOpen}
        onClose={() => setOtaProgressOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <UploadCloud size={20} color={theme.palette.primary.main} />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {t('fleet.otaProgressTitle', { version: otaStatus.latestAgentVersion })}
            </Typography>
          </Stack>
          <Label variant="soft" color={otaTasks.every(t => t.isDone) ? 'success' : 'primary'}>
            {t('fleet.otaCompletedCount', { completed: otaTasks.filter(t => t.isDone).length, total: otaTasks.length })}
          </Label>
        </DialogTitle>

        <DialogContent sx={{ py: 3 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
            {t('fleet.otaDesc')}
          </Typography>

          <Stack spacing={2}>
            {otaTasks.map((task) => (
              <Card key={task.hostId} variant="outlined" sx={{ p: 2.25, borderRadius: 2 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                      {task.displayName} {task.ip ? `• IP: ${task.ip}` : ''}
                    </Typography>
                    <Typography variant="caption" sx={{ color: task.isDone ? 'success.main' : 'primary.main', fontWeight: 600 }}>
                      {task.statusText}
                    </Typography>
                  </Box>
                  <Chip
                    label={task.isDone ? t('fleet.updated') : `${task.progress}%`}
                    color={task.isDone ? 'success' : 'primary'}
                    size="small"
                    sx={{ fontWeight: 800 }}
                  />
                </Stack>

                <LinearProgress
                  variant="determinate"
                  value={task.progress}
                  sx={{
                    height: 7,
                    borderRadius: 3.5,
                    mb: 1.25,
                    '& .MuiLinearProgress-bar': {
                      bgcolor: task.isDone ? 'success.main' : 'primary.main',
                      borderRadius: 3.5
                    }
                  }}
                />

                {/* Step Indicators */}
                <Grid container spacing={1} sx={{ mb: 1.25 }}>
                  <Grid item xs={3}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: task.step >= 1 ? 'primary.main' : 'text.disabled', fontSize: '0.7rem' }}>
                      {t('fleet.step1')}
                    </Typography>
                  </Grid>
                  <Grid item xs={3}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: task.step >= 2 ? 'primary.main' : 'text.disabled', fontSize: '0.7rem' }}>
                      {t('fleet.step2')}
                    </Typography>
                  </Grid>
                  <Grid item xs={3}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: task.step >= 3 ? 'primary.main' : 'text.disabled', fontSize: '0.7rem' }}>
                      {t('fleet.step3')}
                    </Typography>
                  </Grid>
                  <Grid item xs={3}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: task.step >= 4 ? 'success.main' : 'text.disabled', fontSize: '0.7rem' }}>
                      {t('fleet.step4')}
                    </Typography>
                  </Grid>
                </Grid>

                {/* Live Task Log */}
                {task.logs && task.logs.length > 0 && (
                  <Box sx={{ p: 1.25, bgcolor: isLight ? '#F8FAFC' : '#0B0F17', borderRadius: 1.5, fontFamily: 'monospace', fontSize: '0.72rem', border: `1px solid ${theme.palette.divider}` }}>
                    {task.logs.map((log, idx) => (
                      <Typography key={idx} variant="caption" sx={{ display: 'block', color: 'text.secondary', fontFamily: 'inherit', fontSize: 'inherit' }}>
                        {log}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Card>
            ))}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2, px: 3, borderTop: `1px solid ${theme.palette.divider}` }}>
          <Button onClick={() => setOtaProgressOpen(false)} variant="contained" color="primary">
            {t('fleet.close')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Release Notes Dialog */}
      <Dialog
        open={releaseNotesOpen}
        onClose={() => setReleaseNotesOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Sparkles size={20} color={theme.palette.primary.main} />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {t('fleet.releaseNotesTitle', { version: otaStatus.latestAgentVersion })}
            </Typography>
          </Stack>
          <Label variant="filled" color="primary">
            {otaStatus.releaseDate || t('fleet.latest')}
          </Label>
        </DialogTitle>

        <DialogContent sx={{ py: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'text.primary' }}>
            {t('fleet.releaseNotesContent')}
          </Typography>
          <Card variant="outlined" sx={{ p: 2, bgcolor: isLight ? '#F8FAFC' : '#0B0F17', borderRadius: 2, mb: 2 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
              {otaStatus.releaseNotes || t('fleet.releaseNotesDefault')}
            </Typography>
          </Card>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('fleet.releaseNotesNotice')}
          </Typography>
        </DialogContent>

        <DialogActions sx={{ p: 2, px: 3, borderTop: `1px solid ${theme.palette.divider}` }}>
          <Button onClick={() => setReleaseNotesOpen(false)} variant="contained" color="primary">
            {t('fleet.understood')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}


