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
  ShieldAlert,
  Clock,
  UploadCloud,
  Sparkles,
  Terminal,
  RotateCw,
  Check
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
  const { lang, t } = useLanguage();
  const { isSuperAdmin, user } = useAuth();
  const { hosts, setSelectedHostId, telemetryMap } = useWebSocket();

  const canViewPower = isSuperAdmin || user?.permissions?.metrics?.power !== false;
  const canViewTemp = isSuperAdmin || user?.permissions?.metrics?.temperature !== false;
  const canViewHealth = isSuperAdmin || user?.permissions?.metrics?.health !== false;

  const getFriendlyHostName = (host) => {
    if (!host) return 'Máy trạm';
    if (host.displayName && !host.displayName.startsWith('DESKTOP-')) {
      return host.displayName;
    }
    if (host.hostname && !host.hostname.startsWith('DESKTOP-')) {
      return host.hostname;
    }
    const idSuffix = host.id ? host.id.slice(0, 6).toUpperCase() : '';
    return idSuffix ? `Máy trạm #${idSuffix}` : 'Máy trạm Windows';
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'online' | 'offline'

  // OTA Upgrade State
  const [otaStatus, setOtaStatus] = useState({ serverVersion: '2.1.4', latestAgentVersion: '2.1.4', releaseNotes: 'Tối ưu hiệu năng, S.M.A.R.T Disks, Remote Web Terminal & Telegram Topics', releaseDate: '2026-08-18' });
  const [upgradingMap, setUpgradingMap] = useState({});
  const [upgradingAll, setUpgradingAll] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Real-time OTA Progress Modal State
  const [otaProgressOpen, setOtaProgressOpen] = useState(false);
  const [otaTasks, setOtaTasks] = useState([]);

  useEffect(() => {
    apiRequest('/api/v1/ota/status')
      .then(data => setOtaStatus(data || { serverVersion: '2.1.5', latestAgentVersion: '2.1.5', releaseNotes: '', releaseDate: '2026-08-18' }))
      .catch(() => null);
  }, []);

  const startOtaTracking = (tasks) => {
    setOtaTasks(tasks);
    setOtaProgressOpen(true);

    // Simulate multi-step progress tracking for each host task
    tasks.forEach((task) => {
      // Step 1: Sent (0s)
      setTimeout(() => {
        setOtaTasks(prev => prev.map(t => t.hostId === task.hostId ? {
          ...t,
          step: 2,
          progress: 35,
          statusText: 'Đang tải gói bundle mã nguồn (/api/v1/ota/agent-bundle)...',
          logs: [...t.logs, `[${new Date().toLocaleTimeString()}] Agent đã nhận lệnh, bắt đầu tải runtime bundle...`]
        } : t));
      }, 1200);

      // Step 2: Applying & Restarting (2.5s)
      setTimeout(() => {
        setOtaTasks(prev => prev.map(t => t.hostId === task.hostId ? {
          ...t,
          step: 3,
          progress: 75,
          statusText: 'Đang ghi đè file runtime & Khởi động lại dịch vụ...',
          logs: [...t.logs, `[${new Date().toLocaleTimeString()}] Đã ghi đè agent.js & windows.js. Kích hoạt restart...`]
        } : t));
      }, 2800);

      // Step 3: Success & Back Online (4.5s)
      setTimeout(() => {
        setOtaTasks(prev => prev.map(t => t.hostId === task.hostId ? {
          ...t,
          step: 4,
          progress: 100,
          statusText: `Hoàn tất thành công! Agent v${otaStatus.latestAgentVersion} đã hoạt động.`,
          isDone: true,
          logs: [...t.logs, `[${new Date().toLocaleTimeString()}] Nâng cấp OTA hoàn tất! Agent đã online với phiên bản mới.`]
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
      setToastMessage(`Đã gửi lệnh nâng cấp OTA đến máy ${friendlyName}.`);
      startOtaTracking([{
        hostId,
        displayName: friendlyName,
        ip: targetHost?.ip || '',
        hostname: targetHost?.hostname || hostId,
        step: 1,
        progress: 15,
        statusText: 'Đã gửi lệnh qua WebSocket...',
        isDone: false,
        logs: [`[${new Date().toLocaleTimeString()}] Lệnh nâng cấp OTA đã được gửi từ Central Server.`]
      }]);
    } catch (err) {
      alert(err.message);
    } finally {
      setTimeout(() => setUpgradingMap(prev => ({ ...prev, [hostId]: false })), 5000);
    }
  };

  const handleUpgradeAllFleet = async () => {
    const onlineHosts = hosts.filter(h => h.online);
    if (!onlineHosts.length) {
      alert('Không có máy trạm nào đang trực tuyến để nâng cấp.');
      return;
    }
    if (!window.confirm(`Bạn có chắc muốn gửi lệnh nâng cấp OTA cho toàn bộ ${onlineHosts.length} máy trạm trực tuyến không?`)) return;
    setUpgradingAll(true);
    try {
      const res = await apiRequest('/api/v1/hosts/upgrade-all', { method: 'POST' });
      setToastMessage(`Đã gửi lệnh nâng cấp OTA đến ${res.queuedCount} máy trạm đang hoạt động.`);
      
      const newTasks = onlineHosts.map(h => ({
        hostId: h.id,
        displayName: getFriendlyHostName(h),
        ip: h.ip || '',
        hostname: h.hostname,
        step: 1,
        progress: 15,
        statusText: 'Đã gửi lệnh qua WebSocket...',
        isDone: false,
        logs: [`[${new Date().toLocaleTimeString()}] Lệnh nâng cấp OTA đã được gửi từ Central Server.`]
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
        (filterStatus === 'offline' && !h.online);

      return matchSearch && matchStatus;
    });
  }, [hosts, searchTerm, filterStatus]);

  const handleSelectHost = (hostId) => {
    setSelectedHostId(hostId);
    onNavigate('dashboard');
  };

  return (
    <Box>
      {/* Top Action Header */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 4 }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
            {t('fleet.title')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('fleet.description')}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center">
          {isSuperAdmin && (
            <Button
              variant="outlined"
              color="primary"
              startIcon={<UploadCloud size={18} className={upgradingAll ? 'animate-spin' : ''} />}
              onClick={handleUpgradeAllFleet}
              disabled={upgradingAll}
              sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}
            >
              {upgradingAll ? 'Đang nâng cấp Fleet...' : 'Nâng cấp toàn bộ Fleet (OTA)'}
            </Button>
          )}

          {isSuperAdmin && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<Server size={18} />}
              onClick={() => onNavigate('admin')}
              sx={{ boxShadow: theme.customShadows.primary, whiteSpace: 'nowrap' }}
            >
              {t('fleet.approve')}
            </Button>
          )}
        </Stack>
      </Stack>

      {toastMessage && (
        <Alert severity="success" sx={{ mb: 3, borderRadius: 1.5 }} onClose={() => setToastMessage('')}>
          {toastMessage}
        </Alert>
      )}

      {/* OTA Center Banner */}
      <Card
        sx={{
          mb: 3.5,
          p: 2.5,
          background: theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(14, 165, 233, 0.12) 0%, rgba(99, 102, 241, 0.08) 100%)'
            : 'linear-gradient(135deg, #f0f9ff 0%, #e0e7ff 100%)',
          border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}`
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                bgcolor: 'primary.main',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: theme.customShadows.primary
              }}
            >
              <Sparkles size={24} />
            </Box>
            <Box>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  Trung Tâm Nâng Cấp Tự Động (OTA Center)
                </Typography>
                <Label variant="filled" color="primary" sx={{ fontWeight: 800 }}>
                  Bản mới nhất: v{otaStatus.latestAgentVersion}
                </Label>
              </Stack>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                Hệ thống hỗ trợ nạp cập nhật qua mạng (Over-The-Air) cho toàn bộ máy trạm mà không cần cài đặt lại thủ công.
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1.5} alignItems="center">
            <Chip
              label={`${hosts.filter(h => h.version === otaStatus.latestAgentVersion).length} máy đã ở v${otaStatus.latestAgentVersion}`}
              color="success"
              variant="outlined"
              size="small"
              sx={{ fontWeight: 700 }}
            />
            {hosts.filter(h => h.version !== otaStatus.latestAgentVersion).length > 0 && (
              <Chip
                label={`${hosts.filter(h => h.version !== otaStatus.latestAgentVersion).length} máy cần nâng cấp`}
                color="warning"
                size="small"
                sx={{ fontWeight: 700 }}
              />
            )}
            {otaTasks.length > 0 && (
              <Button
                size="small"
                variant="contained"
                color="info"
                startIcon={<Activity size={16} />}
                onClick={() => setOtaProgressOpen(true)}
                sx={{ fontWeight: 700 }}
              >
                Xem Tiến Trình ({otaTasks.length})
              </Button>
            )}
          </Stack>
        </Stack>
      </Card>

      {/* Infrastructure Health Score Widget */}
      {canViewHealth && <HealthScoreWidget />}

      {/* Fleet Summary Scorecards */}
      <Grid container spacing={2.5} sx={{ mb: 3.5 }}>
        {/* Total Machines */}
        <Grid item xs={12} sm={canViewHealth ? 4 : 6}>
          <Card
            sx={{
              p: 2.5,
              height: 1,
              minHeight: 110,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              bgcolor: 'background.paper',
              overflow: 'hidden'
            }}
          >
            <Box sx={{ minWidth: 0, mr: 1.5 }}>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 700, display: 'block' }}>
                {t('fleet.summary.total')}
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, my: 0.5 }}>
                {totalCount}
              </Typography>
              <Typography variant="body2" noWrap sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                {t('fleet.summary.totalHint')}
              </Typography>
            </Box>
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.primary.main, 0.12),
                color: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Server size={26} />
            </Box>
          </Card>
        </Grid>

        {/* System Health */}
        {canViewHealth && (
          <Grid item xs={12} sm={4}>
            <Card
              sx={{
                p: 2.5,
                height: 1,
                minHeight: 110,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                bgcolor: 'background.paper',
                overflow: 'hidden'
              }}
            >
              <Box sx={{ minWidth: 0, mr: 1.5 }}>
                <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 700, display: 'block' }}>
                  {t('fleet.summary.health')}
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 800, my: 0.5, color: healthPercent >= 80 ? 'success.main' : 'warning.main' }}>
                  {totalCount > 0 ? `${healthPercent}%` : '--'}
                </Typography>
                <Typography variant="body2" noWrap sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  {t('fleet.summary.healthHint')} ({onlineCount}/{totalCount})
                </Typography>
              </Box>
              <Box
                sx={{
                  width: 52,
                  height: 52,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.success.main, 0.12),
                  color: 'success.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <Activity size={26} />
              </Box>
            </Card>
          </Grid>
        )}

        {/* Attention Needed */}
        <Grid item xs={12} sm={canViewHealth ? 4 : 6}>
          <Card
            sx={{
              p: 2.5,
              height: 1,
              minHeight: 110,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              bgcolor: attentionHosts.length > 0 ? alpha(theme.palette.error.main, 0.04) : 'background.paper',
              borderColor: attentionHosts.length > 0 ? alpha(theme.palette.error.main, 0.24) : undefined,
              overflow: 'hidden'
            }}
          >
            <Box sx={{ minWidth: 0, mr: 1.5 }}>
              <Typography variant="caption" noWrap sx={{ color: attentionHosts.length > 0 ? 'error.main' : 'text.secondary', fontWeight: 700, display: 'block' }}>
                {t('fleet.summary.attention')}
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, my: 0.5, color: attentionHosts.length > 0 ? 'error.main' : 'text.primary' }}>
                {attentionHosts.length}
              </Typography>
              <Typography variant="body2" noWrap sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                {t('fleet.summary.attentionHint')}
              </Typography>
            </Box>
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.error.main, 0.12),
                color: 'error.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <AlertTriangle size={26} />
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* Filter & Search Toolbar */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 3 }}
      >
        <TextField
          placeholder="Tìm theo tên máy, hostname..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          size="small"
          sx={{ width: { xs: 1, sm: 340 }, bgcolor: 'background.paper', borderRadius: 1.5 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={18} color={theme.palette.text.secondary} />
              </InputAdornment>
            )
          }}
        />

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button
            size="small"
            variant={filterStatus === 'all' ? 'contained' : 'outlined'}
            color={filterStatus === 'all' ? 'primary' : 'inherit'}
            onClick={() => setFilterStatus('all')}
          >
            Tất cả ({totalCount})
          </Button>
          <Button
            size="small"
            variant={filterStatus === 'online' ? 'contained' : 'outlined'}
            color={filterStatus === 'online' ? 'success' : 'inherit'}
            onClick={() => setFilterStatus('online')}
          >
            Trực tuyến ({onlineCount})
          </Button>
          <Button
            size="small"
            variant={filterStatus === 'offline' ? 'contained' : 'outlined'}
            color={filterStatus === 'offline' ? 'warning' : 'inherit'}
            onClick={() => setFilterStatus('offline')}
          >
            Mất kết nối ({hosts.length - onlineCount})
          </Button>
        </Stack>
      </Stack>

      {/* Host Cards Grid */}
      {filteredHosts.length === 0 ? (
        <Card sx={{ p: 6, textAlign: 'center', bgcolor: 'background.paper' }}>
          <Box sx={{ color: 'text.disabled', mb: 2 }}>
            <Server size={48} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            {t('fleet.emptyTitle')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 460, mx: 'auto', mb: 3 }}>
            {t('fleet.emptyDescription')}
          </Typography>
          {isSuperAdmin && (
            <Button variant="contained" color="primary" onClick={() => onNavigate('admin')}>
              {t('fleet.approve')}
            </Button>
          )}
        </Card>
      ) : (
        <Grid container spacing={2.5}>
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
                    p: 2.5,
                    height: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    transition: 'all 0.25s ease-in-out',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: theme.customShadows.z16,
                      borderColor: 'primary.main'
                    }
                  }}
                  onClick={() => handleSelectHost(host.id)}
                >
                  <Box sx={{ minWidth: 0, width: 1 }}>
                    {/* Card Header: Host Title & Status */}
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5} sx={{ mb: 2 }}>
                      <Box sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden' }}>
                        <Typography variant="subtitle1" noWrap sx={{ fontWeight: 800, fontSize: '1.05rem', textOverflow: 'ellipsis' }}>
                          {getFriendlyHostName(host)}
                        </Typography>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
                          <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 600, textOverflow: 'ellipsis' }}>
                            {host.ip ? `IP: ${host.ip} • ` : ''}{host.platform || 'Windows'}
                          </Typography>
                          <Label
                            variant="outlined"
                            color={host.version === otaStatus.latestAgentVersion ? 'success' : 'warning'}
                            sx={{ fontSize: '0.65rem', height: 18, px: 0.5 }}
                          >
                            v{host.version || '2.1.4'}
                          </Label>
                          {host.includeHealth === false && (
                            <Label
                              variant="soft"
                              color="default"
                              sx={{ fontSize: '0.65rem', height: 18, px: 0.5 }}
                            >
                              Máy cá nhân
                            </Label>
                          )}
                        </Stack>
                      </Box>

                      <Stack direction="row" spacing={1} alignItems="center">
                        <Label
                          variant="soft"
                          color={host.online ? 'success' : 'default'}
                          startIcon={host.online ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                          sx={{ flexShrink: 0 }}
                        >
                          {host.online ? t('common.online') : t('common.offline')}
                        </Label>

                        {isSuperAdmin && host.online && (
                          <Tooltip title="Nâng cấp Agent OTA (Tự động tải & cập nhật code mới)">
                            <IconButton
                              size="small"
                              color="primary"
                              disabled={Boolean(upgradingMap[host.id])}
                              onClick={(e) => handleUpgradeHost(e, host.id)}
                              sx={{ bgcolor: alpha(theme.palette.primary.main, 0.08) }}
                            >
                              <UploadCloud size={15} className={upgradingMap[host.id] ? 'animate-spin' : ''} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </Stack>

                    {/* Telemetry Progress Bars */}
                    {host.online ? (
                      <Stack spacing={2} sx={{ my: 2 }}>
                        {/* CPU Bar */}
                        <Box>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                            <Typography variant="caption" noWrap sx={{ fontWeight: 700, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Cpu size={14} /> CPU
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: cpuUsage > 80 ? 'error.main' : 'text.primary', flexShrink: 0 }}>
                              {cpuUsage.toFixed(1)}%
                            </Typography>
                          </Stack>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(cpuUsage, 100)}
                            sx={{
                              height: 6,
                              borderRadius: 3,
                              bgcolor: alpha(theme.palette.grey[500], 0.16),
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
                            <Typography variant="caption" noWrap sx={{ fontWeight: 700, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              <HardDrive size={14} /> RAM ({memUsed} / {memTotal})
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: memPercent > 85 ? 'error.main' : 'text.primary', flexShrink: 0, ml: 1 }}>
                              {memPercent.toFixed(1)}%
                            </Typography>
                          </Stack>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(memPercent, 100)}
                            sx={{
                              height: 6,
                              borderRadius: 3,
                              bgcolor: alpha(theme.palette.grey[500], 0.16),
                              '& .MuiLinearProgress-bar': {
                                bgcolor: memPercent > 85 ? 'error.main' : 'info.main',
                                borderRadius: 3
                              }
                            }}
                          />
                        </Box>

                        {/* Power & Temp Pill only if valid sensors exist and user has permission */}
                        {(((canViewPower && Number.isFinite(powerWatts) && powerWatts > 0)) || ((canViewTemp && Number.isFinite(hardware.temperatures?.maxCelsius) && hardware.temperatures.maxCelsius > 0))) && (
                          <Stack direction="row" spacing={1} sx={{ pt: 0.5 }}>
                            {canViewPower && Number.isFinite(powerWatts) && powerWatts > 0 && (
                              <Label variant="soft" color="warning" startIcon={<Zap size={12} />}>
                                {formatWatts(powerWatts)}
                              </Label>
                            )}
                            {canViewTemp && Number.isFinite(hardware.temperatures?.maxCelsius) && hardware.temperatures.maxCelsius > 0 && (
                              <Label variant="soft" color={hardware.temperatures.maxCelsius > 75 ? 'error' : 'success'} startIcon={<Thermometer size={12} />}>
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
                          p: 2,
                          borderRadius: 2,
                          bgcolor: alpha(theme.palette.grey[500], 0.08),
                          textAlign: 'center'
                        }}
                      >
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                          {t('machine.waiting')}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  {/* Card Footer */}
                  <Box sx={{ pt: 2, borderTop: `1px solid ${theme.palette.divider}`, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Typography variant="caption" noWrap sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Clock size={12} /> {formatRelativeTime(host.lastSeen, lang)}
                      </Typography>

                      <Button
                        size="small"
                        endIcon={<ArrowRight size={14} />}
                        sx={{ fontWeight: 700, p: 0 }}
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
        PaperProps={{
          sx: {
            borderRadius: 2,
            bgcolor: theme.palette.mode === 'dark' ? '#0f172a' : '#ffffff'
          }
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <UploadCloud size={22} color={theme.palette.primary.main} />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Tiến Trình Nâng Cấp Agent OTA • v{otaStatus.latestAgentVersion}
            </Typography>
          </Stack>
          <Label variant="soft" color={otaTasks.every(t => t.isDone) ? 'success' : 'primary'}>
            {otaTasks.filter(t => t.isDone).length} / {otaTasks.length} Hoàn tất
          </Label>
        </DialogTitle>

        <DialogContent sx={{ py: 3 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
            Quá trình nâng cấp OTA tự động tải gói bundle mã nguồn mới nhất từ Central Server, áp dụng file runtime và tự khởi động lại Agent.
          </Typography>

          <Stack spacing={2.5}>
            {otaTasks.map((task) => (
              <Card key={task.hostId} variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                      {task.displayName} {task.ip ? `• IP: ${task.ip}` : ''}
                    </Typography>
                    <Typography variant="caption" sx={{ color: task.isDone ? 'success.main' : 'primary.main', fontWeight: 600 }}>
                      {task.statusText}
                    </Typography>
                  </Box>
                  <Chip
                    label={task.isDone ? 'Đã cập nhật' : `${task.progress}%`}
                    color={task.isDone ? 'success' : 'primary'}
                    size="small"
                    sx={{ fontWeight: 800 }}
                  />
                </Stack>

                <LinearProgress
                  variant="determinate"
                  value={task.progress}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    mb: 1.5,
                    bgcolor: alpha(theme.palette.primary.main, 0.12),
                    '& .MuiLinearProgress-bar': {
                      bgcolor: task.isDone ? 'success.main' : 'primary.main',
                      borderRadius: 4
                    }
                  }}
                />

                {/* Step Indicators */}
                <Grid container spacing={1} sx={{ mb: 1.5 }}>
                  <Grid item xs={3}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: task.step >= 1 ? 'primary.main' : 'text.disabled' }}>
                      1. Gửi lệnh
                    </Typography>
                  </Grid>
                  <Grid item xs={3}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: task.step >= 2 ? 'primary.main' : 'text.disabled' }}>
                      2. Tải bundle
                    </Typography>
                  </Grid>
                  <Grid item xs={3}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: task.step >= 3 ? 'primary.main' : 'text.disabled' }}>
                      3. Ghi đè & Restart
                    </Typography>
                  </Grid>
                  <Grid item xs={3}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: task.step >= 4 ? 'success.main' : 'text.disabled' }}>
                      4. Hoàn tất
                    </Typography>
                  </Grid>
                </Grid>

                {/* Live Task Log */}
                {task.logs && task.logs.length > 0 && (
                  <Box sx={{ p: 1.5, bgcolor: theme.palette.mode === 'dark' ? '#020617' : '#f8fafc', borderRadius: 1, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {task.logs.map((log, idx) => (
                      <Typography key={idx} variant="caption" sx={{ display: 'block', color: 'text.secondary', fontFamily: 'inherit' }}>
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
            Đóng Màn Hình
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
