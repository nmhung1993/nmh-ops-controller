import React, { useState, useMemo } from 'react';
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
  ArrowRight,
  ShieldAlert,
  Clock
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import { formatBytes, formatRelativeTime, formatWatts, formatTemperature } from '../utils/formatters';
import Label from '../components/common/Label';

export default function FleetView({ onNavigate }) {
  const theme = useTheme();
  const { lang, t } = useLanguage();
  const { isSuperAdmin } = useAuth();
  const { hosts, setSelectedHostId, telemetryMap } = useWebSocket();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'online' | 'offline'

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
      const matchSearch =
        !searchTerm ||
        h.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.hostname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
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

        {isSuperAdmin && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<Server size={18} />}
            onClick={() => onNavigate('admin')}
            sx={{ boxShadow: theme.customShadows.primary }}
          >
            {t('fleet.approve')}
          </Button>
        )}
      </Stack>

      {/* Fleet Summary Scorecards */}
      <Grid container spacing={2.5} sx={{ mb: 3.5 }}>
        {/* Total Machines */}
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

        {/* Attention Needed */}
        <Grid item xs={12} sm={4}>
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
                          {host.displayName || host.hostname}
                        </Typography>
                        <Typography variant="caption" noWrap sx={{ color: 'text.secondary', display: 'block', fontWeight: 600, textOverflow: 'ellipsis' }}>
                          {host.hostname} • {host.platform || 'Windows'}
                        </Typography>
                      </Box>

                      <Label
                        variant="soft"
                        color={host.online ? 'success' : 'default'}
                        startIcon={host.online ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        sx={{ flexShrink: 0 }}
                      >
                        {host.online ? t('common.online') : t('common.offline')}
                      </Label>
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

                        {/* Power & Temp Pill if available */}
                        {Number.isFinite(powerWatts) && (
                          <Stack direction="row" spacing={1} sx={{ pt: 0.5 }}>
                            <Label variant="soft" color="warning" startIcon={<Zap size={12} />}>
                              {formatWatts(powerWatts)}
                            </Label>
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
    </Box>
  );
}
