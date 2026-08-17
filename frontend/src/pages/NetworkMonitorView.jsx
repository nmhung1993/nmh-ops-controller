import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardHeader,
  CardContent,
  Stack,
  Typography,
  Button,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
  Alert,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Globe,
  Activity,
  Plus,
  Play,
  Pause,
  RotateCcw,
  Search,
  Wifi,
  Radio,
  Server,
  Zap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Trash2,
  Settings,
  Power,
  RefreshCw,
  Edit2,
  Layers,
  ChevronDown,
  History
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { apiRequest } from '../utils/api';
import Label from '../components/common/Label';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function NetworkMonitorView() {
  const theme = useTheme();
  const { lang, t } = useLanguage();

  const [currentTab, setCurrentTab] = useState(0);
  const [targets, setTargets] = useState([]);
  const [summary, setSummary] = useState({ total: 0, online: 0, degraded: 0, offline: 0, paused: 0 });
  const [loading, setLoading] = useState(true);
  const [tagFilter, setTagFilter] = useState('all');

  // Scanner state
  const [scanSubnet, setScanSubnet] = useState('192.168.31.0/24');
  const [scanState, setScanState] = useState({ isScanning: false, current: 0, total: 254, results: [] });
  const [scanHistoryList, setScanHistoryList] = useState([]);

  // Xiaomi Router state
  const [routerStatus, setRouterStatus] = useState(null);
  const [loadingRouter, setLoadingRouter] = useState(false);
  const [routerConfigOpen, setRouterConfigOpen] = useState(false);
  const [routerHost, setRouterHost] = useState('192.168.31.1');
  const [routerPassword, setRouterPassword] = useState('@nmhung1993');

  // Target Modal Dialog
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [targetName, setTargetName] = useState('');
  const [targetHost, setTargetHost] = useState('');
  const [targetTag, setTargetTag] = useState('Router');
  const [targetIntervalSec, setTargetIntervalSec] = useState(3);

  // Confirm dialogs
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmRebootTarget, setConfirmRebootTarget] = useState(null); // { ip, name }
  const [confirmWifiRestartTarget, setConfirmWifiRestartTarget] = useState(null); // { ip, name }
  const [actionMessage, setActionMessage] = useState(null);

  // Fetch targets and summary
  const loadTargets = useCallback(async () => {
    try {
      const [targetsData, summaryData] = await Promise.all([
        apiRequest('/api/v1/network/targets'),
        apiRequest('/api/v1/network/summary')
      ]);
      setTargets(Array.isArray(targetsData) ? targetsData : []);
      setSummary(summaryData || { total: 0, online: 0, degraded: 0, offline: 0, paused: 0 });
    } catch (err) {
      console.error('Failed to load network targets:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch scan progress and history
  const loadScanState = useCallback(async () => {
    try {
      const [state, history] = await Promise.all([
        apiRequest('/api/v1/network/scan'),
        apiRequest('/api/v1/network/scan/history')
      ]);
      setScanState(state || { isScanning: false, current: 0, total: 254, results: [] });
      setScanHistoryList(Array.isArray(history) ? history : []);
    } catch (err) {}
  }, []);

  // Fetch router status
  const loadRouterStatus = useCallback(async () => {
    setLoadingRouter(true);
    try {
      const data = await apiRequest('/api/v1/network/xiaomi/status');
      setRouterStatus(data);
    } catch (err) {
      setRouterStatus(null);
    } finally {
      setLoadingRouter(false);
    }
  }, []);

  useEffect(() => {
    loadTargets();
    const interval = setInterval(loadTargets, 3000);
    return () => clearInterval(interval);
  }, [loadTargets]);

  useEffect(() => {
    if (currentTab === 1) {
      loadScanState();
      if (scanState.isScanning) {
        const interval = setInterval(loadScanState, 1500);
        return () => clearInterval(interval);
      }
    }
  }, [currentTab, scanState.isScanning, loadScanState]);

  useEffect(() => {
    if (currentTab === 2 || !routerStatus) {
      loadRouterStatus();
    }
  }, [currentTab, loadRouterStatus]);

  // Ping target immediately
  const handlePingNow = async (id, e) => {
    e?.stopPropagation();
    try {
      await apiRequest(`/api/v1/network/targets/${id}/ping`, { method: 'POST' });
      loadTargets();
    } catch (err) {
      console.error('Ping failed:', err);
    }
  };

  // Toggle pause / resume target
  const handleToggleTargetEnabled = async (target, e) => {
    e?.stopPropagation();
    try {
      await apiRequest(`/api/v1/network/targets/${target.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !target.enabled })
      });
      loadTargets();
    } catch (err) {
      alert(err.message);
    }
  };

  // Open add target modal
  const handleOpenAddTarget = (prefillHost = '', prefillName = '') => {
    setEditingTarget(null);
    setTargetName(prefillName || prefillHost || '');
    setTargetHost(prefillHost || '');
    setTargetTag('Device');
    setTargetIntervalSec(3);
    setTargetDialogOpen(true);
  };

  // Open edit target modal
  const handleOpenEditTarget = (target, e) => {
    e?.stopPropagation();
    setEditingTarget(target);
    setTargetName(target.name || '');
    setTargetHost(target.host || '');
    setTargetTag(target.tag || 'Device');
    setTargetIntervalSec(Math.round((target.interval || 3000) / 1000));
    setTargetDialogOpen(true);
  };

  // Save target
  const handleSaveTarget = async (e) => {
    e.preventDefault();
    if (!targetHost.trim()) return;

    try {
      const intervalMs = Math.max(1, Number(targetIntervalSec)) * 1000;
      if (editingTarget) {
        await apiRequest(`/api/v1/network/targets/${editingTarget.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: targetName.trim(),
            host: targetHost.trim(),
            tag: targetTag.trim(),
            interval: intervalMs
          })
        });
      } else {
        await apiRequest('/api/v1/network/targets', {
          method: 'POST',
          body: JSON.stringify({
            name: targetName.trim(),
            host: targetHost.trim(),
            tag: targetTag.trim(),
            interval: intervalMs
          })
        });
      }
      setTargetDialogOpen(false);
      loadTargets();
    } catch (err) {
      alert(err.message);
    }
  };

  // Delete target
  const handleDeleteTarget = async () => {
    if (!confirmDeleteId) return;
    try {
      await apiRequest(`/api/v1/network/targets/${confirmDeleteId}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      loadTargets();
    } catch (err) {
      alert(err.message);
    }
  };

  // Start subnet scan
  const handleStartScan = async () => {
    try {
      await apiRequest('/api/v1/network/scan', {
        method: 'POST',
        body: JSON.stringify({ subnet: scanSubnet })
      });
      loadScanState();
    } catch (err) {
      alert(err.message);
    }
  };

  // Stop scan
  const handleStopScan = async () => {
    try {
      await apiRequest('/api/v1/network/scan', { method: 'DELETE' });
      loadScanState();
    } catch (err) {}
  };

  // Save router config
  const handleSaveRouterConfig = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/api/v1/network/xiaomi/config', {
        method: 'POST',
        body: JSON.stringify({ host: routerHost, password: routerPassword })
      });
      setRouterConfigOpen(false);
      loadRouterStatus();
    } catch (err) {
      alert(err.message);
    }
  };

  // Reboot router or node
  const handleReboot = async () => {
    if (!confirmRebootTarget) return;
    try {
      const res = await apiRequest('/api/v1/network/xiaomi/reboot', {
        method: 'POST',
        body: JSON.stringify({ nodeIp: confirmRebootTarget.ip })
      });
      setActionMessage(res.message || `Đã gửi lệnh khởi động lại ${confirmRebootTarget.name}`);
      setConfirmRebootTarget(null);
    } catch (err) {
      alert(err.message);
    }
  };

  // Restart Wi-Fi on router or node
  const handleRestartWifi = async () => {
    if (!confirmWifiRestartTarget) return;
    try {
      const res = await apiRequest('/api/v1/network/xiaomi/restart-wifi', {
        method: 'POST',
        body: JSON.stringify({ nodeIp: confirmWifiRestartTarget.ip })
      });
      setActionMessage(res.message || `Đã gửi lệnh khởi động lại Wi-Fi ${confirmWifiRestartTarget.name}`);
      setConfirmWifiRestartTarget(null);
    } catch (err) {
      alert(err.message);
    }
  };

  // Filtered targets
  const tagsList = ['all', ...new Set(targets.map(t => t.tag).filter(Boolean))];
  const filteredTargets = targets.filter(t => tagFilter === 'all' || t.tag === tagFilter);

  // WAN IP & Gateway & DNS info
  const wanIp = routerStatus?.wan?.ip || '116.109.15.114';
  const gatewayStr = routerStatus?.wan?.gateway || '192.168.1.1';
  const dnsStr = routerStatus?.wan?.dns || '8.8.8.8, 8.8.4.4';

  return (
    <Box>
      {/* Top Action Header */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
            Giám sát mạng nội bộ
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Theo dõi độ trễ, packet loss theo thời gian thực và quản lý Xiaomi Router/Mesh
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Plus size={18} />}
            onClick={() => handleOpenAddTarget()}
            sx={{ fontWeight: 700, boxShadow: theme.customShadows.primary }}
          >
            Thêm Target
          </Button>
        </Stack>
      </Stack>

      {/* Summary 4 Scorecards */}
      <Grid container spacing={2.5} sx={{ mb: 3.5 }}>
        {/* Card 1: Total Targets */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2.5, height: 1, minHeight: 105, display: 'flex', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' }}>
            <Box sx={{ minWidth: 0, mr: 1.5 }}>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 700 }}>
                Tổng số Target
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, my: 0.5 }}>
                {summary.total}
              </Typography>
              <Typography variant="body2" noWrap sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                {summary.paused > 0 ? `${summary.paused} target đang tạm dừng` : 'Đang theo dõi liên tục'}
              </Typography>
            </Box>
            <Box sx={{ width: 50, height: 50, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Globe size={24} />
            </Box>
          </Card>
        </Grid>

        {/* Card 2: Online / Active */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2.5, height: 1, minHeight: 105, display: 'flex', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' }}>
            <Box sx={{ minWidth: 0, mr: 1.5 }}>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 700 }}>
                Trực tuyến / Ổn định
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, my: 0.5, color: 'success.main' }}>
                {summary.online}
              </Typography>
              <Typography variant="body2" noWrap sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                Độ trễ tốt (&lt;150ms)
              </Typography>
            </Box>
            <Box sx={{ width: 50, height: 50, borderRadius: 2, bgcolor: alpha(theme.palette.success.main, 0.12), color: 'success.main', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckCircle2 size={24} />
            </Box>
          </Card>
        </Grid>

        {/* Card 3: Degraded / Offline */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2.5, height: 1, minHeight: 105, display: 'flex', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' }}>
            <Box sx={{ minWidth: 0, mr: 1.5 }}>
              <Typography variant="caption" noWrap sx={{ color: summary.offline > 0 ? 'error.main' : 'text.secondary', fontWeight: 700 }}>
                Suy giảm / Mất kết nối
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, my: 0.5, color: summary.offline > 0 ? 'error.main' : 'text.primary' }}>
                {summary.degraded + summary.offline}
              </Typography>
              <Typography variant="body2" noWrap sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                {summary.offline} mất kết nối • {summary.degraded} độ trễ cao
              </Typography>
            </Box>
            <Box sx={{ width: 50, height: 50, borderRadius: 2, bgcolor: alpha(theme.palette.error.main, 0.12), color: 'error.main', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AlertTriangle size={24} />
            </Box>
          </Card>
        </Grid>

        {/* Card 4: WAN & Gateway (Replaced Average Latency) */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2.5, height: 1, minHeight: 105, display: 'flex', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' }}>
            <Box sx={{ minWidth: 0, mr: 1.5 }}>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 700 }}>
                Cấu hình WAN & Gateway
              </Typography>
              <Typography variant="h4" noWrap sx={{ fontWeight: 800, my: 0.5, color: 'primary.main', fontFamily: 'monospace' }}>
                {wanIp}
              </Typography>
              <Typography variant="body2" noWrap sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                GW: {gatewayStr} • DNS: {dnsStr}
              </Typography>
            </Box>
            <Box sx={{ width: 50, height: 50, borderRadius: 2, bgcolor: alpha(theme.palette.info.main, 0.12), color: 'info.main', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Globe size={24} />
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs Selector */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={currentTab} onChange={(_, v) => setCurrentTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab icon={<Globe size={18} />} iconPosition="start" label="Giám sát kết nối (Ping Monitor)" sx={{ fontWeight: 700 }} />
          <Tab icon={<Search size={18} />} iconPosition="start" label="Quét mạng LAN (Subnet Scanner)" sx={{ fontWeight: 700 }} />
          <Tab icon={<Wifi size={18} />} iconPosition="start" label="Xiaomi Router & Mesh (CR8806)" sx={{ fontWeight: 700 }} />
        </Tabs>
      </Box>

      {/* Action Notification Message if any */}
      {actionMessage && (
        <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setActionMessage(null)}>
          {actionMessage}
        </Alert>
      )}

      {/* ==================================================== */}
      {/* TAB 1: PING MONITOR TARGETS GRID */}
      {/* ==================================================== */}
      {currentTab === 0 && (
        <Box>
          {/* Tag Filter Pills */}
          <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap', gap: 1 }}>
            {tagsList.map((tag) => (
              <Button
                key={tag}
                size="small"
                variant={tagFilter === tag ? 'contained' : 'outlined'}
                color={tagFilter === tag ? 'primary' : 'inherit'}
                onClick={() => setTagFilter(tag)}
                sx={{ borderRadius: 1.5, fontWeight: 700 }}
              >
                {tag === 'all' ? `Tất cả (${targets.length})` : tag}
              </Button>
            ))}
          </Stack>

          {/* Targets Grid */}
          <Grid container spacing={2.5}>
            {filteredTargets.map((target) => {
              const isPaused = !target.enabled;
              const isOnline = target.enabled && target.status === 'online';
              const isDegraded = target.enabled && target.status === 'degraded';
              const statusColor = isPaused ? 'default' : isOnline ? 'success' : isDegraded ? 'warning' : 'error';
              const statusLabel = isPaused ? 'Tạm dừng' : isOnline ? 'Online' : isDegraded ? 'Degraded' : 'Offline';

              return (
                <Grid item xs={12} sm={6} lg={4} key={target.id}>
                  <Card
                    sx={{
                      p: 2.5,
                      height: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      overflow: 'hidden',
                      border: `1px solid ${theme.palette.divider}`,
                      opacity: isPaused ? 0.75 : 1,
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: theme.customShadows.z8
                      }
                    }}
                  >
                    <Box>
                      {/* Top Header */}
                      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5} sx={{ mb: 1.5 }}>
                        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                          <Typography variant="subtitle1" noWrap sx={{ fontWeight: 800 }}>
                            {target.name}
                          </Typography>
                          <Typography variant="caption" noWrap sx={{ color: 'text.secondary', display: 'block', fontFamily: 'monospace', fontWeight: 600 }}>
                            {target.host} • {target.tag || 'Device'} • {Math.round((target.interval || 3000) / 1000)}s
                          </Typography>
                        </Box>

                        <Label
                          variant="soft"
                          color={statusColor}
                          startIcon={isPaused ? <Pause size={12} /> : isOnline ? <CheckCircle2 size={12} /> : isDegraded ? <AlertTriangle size={12} /> : <XCircle size={12} />}
                          sx={{ flexShrink: 0 }}
                        >
                          {statusLabel}
                        </Label>
                      </Stack>

                      {/* Latency & Packet Loss Metrics */}
                      <Stack direction="row" spacing={2} sx={{ my: 2, p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.grey[500], 0.06) }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                            ĐỘ TRỄ (PING)
                          </Typography>
                          <Typography variant="h5" sx={{ fontWeight: 800, color: isPaused ? 'text.disabled' : `${statusColor}.main` }}>
                            {!isPaused && target.latency !== null ? `${target.latency} ms` : '--'}
                          </Typography>
                        </Box>
                        <Divider orientation="vertical" flexItem />
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                            PACKET LOSS
                          </Typography>
                          <Typography variant="h5" sx={{ fontWeight: 800, color: target.packetLoss > 10 ? 'error.main' : 'text.primary' }}>
                            {!isPaused ? `${target.packetLoss}%` : '--'}
                          </Typography>
                        </Box>
                      </Stack>

                      {/* Recent History Dots */}
                      <Box sx={{ mb: 1.5 }}>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', mr: 1 }}>
                            Lịch sử:
                          </Typography>
                          {(target.history || []).slice(-12).map((h, i) => (
                            <Tooltip key={i} title={`${h.time.split('T')[1].slice(0, 8)}: ${h.latency !== null ? `${h.latency}ms` : 'Timeout'}`}>
                              <Box
                                sx={{
                                  width: 8,
                                  height: 16,
                                  borderRadius: 1,
                                  bgcolor: h.status === 'online' ? 'success.main' : h.status === 'degraded' ? 'warning.main' : 'error.main'
                                }}
                              />
                            </Tooltip>
                          ))}
                        </Stack>
                      </Box>
                    </Box>

                    {/* Footer Actions */}
                    <Box sx={{ pt: 1.5, borderTop: `1px solid ${theme.palette.divider}` }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Clock size={12} /> {target.lastCheck ? target.lastCheck.split('T')[1].slice(0, 8) : '--'}
                        </Typography>

                        <Stack direction="row" spacing={0.5}>
                          {/* Pause / Resume Button */}
                          <IconButton
                            size="small"
                            color={target.enabled ? 'warning' : 'success'}
                            onClick={(e) => handleToggleTargetEnabled(target, e)}
                            title={target.enabled ? 'Tạm dừng ping' : 'Tiếp tục ping'}
                          >
                            {target.enabled ? <Pause size={14} /> : <Play size={14} />}
                          </IconButton>

                          {/* Edit Button */}
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={(e) => handleOpenEditTarget(target, e)}
                            title="Sửa target"
                          >
                            <Edit2 size={14} />
                          </IconButton>

                          {/* Instant Ping Button */}
                          <IconButton
                            size="small"
                            onClick={(e) => handlePingNow(target.id, e)}
                            title="Ping ngay"
                          >
                            <RotateCcw size={14} />
                          </IconButton>

                          {/* Delete Button */}
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setConfirmDeleteId(target.id)}
                            title="Xóa target"
                          >
                            <Trash2 size={14} />
                          </IconButton>
                        </Stack>
                      </Stack>
                    </Box>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      {/* ==================================================== */}
      {/* TAB 2: SUBNET SCANNER WITH ARP, HOSTNAME & 20 HISTORY */}
      {/* ==================================================== */}
      {currentTab === 1 && (
        <Stack spacing={3}>
          <Card sx={{ p: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" sx={{ mb: 3 }}>
              <TextField
                label="Dải mạng / Subnet CIDR"
                value={scanSubnet}
                onChange={(e) => setScanSubnet(e.target.value)}
                size="small"
                sx={{ width: { xs: 1, sm: 300 } }}
              />
              {scanState.isScanning ? (
                <Button variant="contained" color="error" startIcon={<RotateCcw size={16} />} onClick={handleStopScan}>
                  Dừng quét ({scanState.current}/{scanState.total})
                </Button>
              ) : (
                <Button variant="contained" color="primary" startIcon={<Play size={16} />} onClick={handleStartScan}>
                  Bắt đầu quét mạng
                </Button>
              )}
            </Stack>

            {scanState.isScanning && (
              <Box sx={{ mb: 3 }}>
                <LinearProgress variant="determinate" value={(scanState.current / scanState.total) * 100} sx={{ height: 8, borderRadius: 4 }} />
                <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                  Đang quét: {scanState.current} / {scanState.total} địa chỉ IP ({Math.round((scanState.current / scanState.total) * 100)}%)
                </Typography>
              </Box>
            )}

            <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
              Kết quả quét hiện tại ({scanState.results?.length || 0} thiết bị)
            </Typography>

            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Địa chỉ IP</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Tên / Domain</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Địa chỉ MAC</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Độ trễ</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Trạng thái</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Hành động</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(!scanState.results || scanState.results.length === 0) ? (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                        Chưa có thiết bị nào được quét. Hãy nhấn "Bắt đầu quét mạng".
                      </TableCell>
                    </TableRow>
                  ) : (
                    scanState.results.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{item.ip}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{item.hostname || '--'}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{item.mac || 'N/A'}</TableCell>
                        <TableCell>{item.latency} ms</TableCell>
                        <TableCell>
                          <Label variant="soft" color="success">Trực tuyến</Label>
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right' }}>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<Plus size={14} />}
                            onClick={() => handleOpenAddTarget(item.ip, item.hostname || `Device (${item.ip})`)}
                          >
                            Theo dõi
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>

          {/* Scan History (20 most recent) */}
          <Card sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <History size={20} color={theme.palette.primary.main} /> Lịch sử quét mạng (20 lần gần nhất)
            </Typography>

            {scanHistoryList.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Chưa có lịch sử phiên quét nào.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {scanHistoryList.map((session, idx) => (
                  <Accordion key={session.id || idx} variant="outlined" sx={{ borderRadius: 1.5 }}>
                    <AccordionSummary expandIcon={<ChevronDown size={18} />}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: 1, pr: 2 }}>
                        <Stack direction="row" spacing={2} alignItems="center">
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {session.subnet}
                          </Typography>
                          <Label variant="soft" color="primary">
                            {session.totalDiscovered} thiết bị
                          </Label>
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {session.scannedAt ? new Date(session.scannedAt).toLocaleString() : '--'}
                        </Typography>
                      </Stack>
                    </AccordionSummary>
                    <AccordionDetails>
                      <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 700 }}>IP</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>Tên / Hostname</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>MAC</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>Latency</TableCell>
                              <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Thao tác</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {(session.results || []).map((res, rIdx) => (
                              <TableRow key={rIdx}>
                                <TableCell sx={{ fontFamily: 'monospace' }}>{res.ip}</TableCell>
                                <TableCell>{res.hostname || '--'}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{res.mac || 'N/A'}</TableCell>
                                <TableCell>{res.latency} ms</TableCell>
                                <TableCell sx={{ textAlign: 'right' }}>
                                  <Button
                                    size="small"
                                    variant="text"
                                    startIcon={<Plus size={14} />}
                                    onClick={() => handleOpenAddTarget(res.ip, res.hostname || `Device (${res.ip})`)}
                                  >
                                    Thêm
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Stack>
            )}
          </Card>
        </Stack>
      )}

      {/* ==================================================== */}
      {/* TAB 3: XIAOMI ROUTER & SECONDARY MESH NODES */}
      {/* ==================================================== */}
      {currentTab === 2 && (
        <Box>
          {loadingRouter ? (
            <LinearProgress sx={{ my: 4, borderRadius: 2 }} />
          ) : !routerStatus ? (
            <Card sx={{ p: 4, textAlign: 'center' }}>
              <Wifi size={48} color={theme.palette.text.disabled} />
              <Typography variant="h6" sx={{ mt: 2, fontWeight: 700 }}>
                Không thể kết nối Xiaomi Router
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                Kiểm tra lại IP router (192.168.31.1) và mật khẩu quản trị (@nmhung1993).
              </Typography>
              <Button variant="contained" startIcon={<Settings size={16} />} onClick={() => setRouterConfigOpen(true)}>
                Cấu hình kết nối Router
              </Button>
            </Card>
          ) : (
            <Stack spacing={3}>
              {/* Router Identity Banner */}
              <Card sx={{ p: 3, background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${theme.palette.background.paper} 100%)` }}>
                <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center" justifyContent="space-between" spacing={2.5}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box sx={{ width: 56, height: 56, borderRadius: 2.5, bgcolor: 'primary.main', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Wifi size={30} />
                    </Box>
                    <Box>
                      <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: 1 }}>
                        ROUTER GATEWAY / MESH CONTROLLER
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 800 }}>
                        {routerStatus.routerName} ({routerStatus.hardware})
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                        Host: {routerStatus.host} • ROM: v{routerStatus.version} • WAN IP: {routerStatus.wan?.ip} • {routerStatus.uptimeFormatted}
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack direction="row" spacing={1.5}>
                    <Button
                      variant="outlined"
                      color="warning"
                      startIcon={<RotateCcw size={16} />}
                      onClick={() => setConfirmWifiRestartTarget({ ip: routerStatus.host, name: 'Router chính' })}
                    >
                      Khởi động lại Wi-Fi
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<Power size={16} />}
                      onClick={() => setConfirmRebootTarget({ ip: routerStatus.host, name: 'Router chính' })}
                    >
                      Reboot Router
                    </Button>
                    <Button variant="contained" color="inherit" startIcon={<Settings size={16} />} onClick={() => setRouterConfigOpen(true)}>
                      Cấu hình
                    </Button>
                  </Stack>
                </Stack>
              </Card>

              {/* Wi-Fi & Load Metric Cards */}
              <Grid container spacing={2.5}>
                {/* 2.4G & 5G Clients */}
                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ p: 2.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>TỔNG THIẾT BỊ WI-FI</Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, my: 0.5 }}>{routerStatus.wifi?.count || 0}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                      📶 2.4GHz: {routerStatus.wifi?.wifi24Count || 0} • 5GHz: {routerStatus.wifi?.wifi50Count || 0}
                    </Typography>
                  </Card>
                </Grid>

                {/* Router CPU Load */}
                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ p: 2.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>TẢI CPU ROUTER</Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, my: 0.5 }}>{routerStatus.cpu}%</Typography>
                    <LinearProgress variant="determinate" value={routerStatus.cpu} sx={{ height: 6, borderRadius: 3, mt: 1 }} />
                  </Card>
                </Grid>

                {/* Router Memory */}
                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ p: 2.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>RAM ROUTER</Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, my: 0.5 }}>{routerStatus.memory}%</Typography>
                    <LinearProgress variant="determinate" value={routerStatus.memory} sx={{ height: 6, borderRadius: 3, mt: 1 }} />
                  </Card>
                </Grid>

                {/* Mesh Nodes Count */}
                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ p: 2.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>MESH NODES PHỤ</Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, my: 0.5 }}>{routerStatus.meshNodes?.length || 0}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                      Tự động đồng bộ IP
                    </Typography>
                  </Card>
                </Grid>
              </Grid>

              {/* Secondary Mesh Nodes Management Section */}
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Layers size={20} color={theme.palette.primary.main} /> Quản lý các Node Mesh phụ ({routerStatus.meshNodes?.length || 0})
                </Typography>

                <Grid container spacing={2.5}>
                  {(routerStatus.meshNodes || []).map((node) => (
                    <Grid item xs={12} md={6} key={node.id}>
                      <Card sx={{ p: 2.5, border: `1px solid ${theme.palette.divider}` }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                          <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                              {node.name}
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary', fontFamily: 'monospace', fontWeight: 600 }}>
                              IP: {node.ip || 'Chưa nhận IP'} • {node.hardware} (v{node.version})
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700, mt: 0.5, display: 'block' }}>
                              Kết nối: {node.backhaulLabel}
                            </Typography>
                          </Box>

                          <Label variant="soft" color={node.online ? 'success' : 'error'}>
                            {node.online ? 'Trực tuyến' : 'Ngoại tuyến'}
                          </Label>
                        </Stack>

                        <Stack direction="row" spacing={2} sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.grey[500], 0.06), mb: 2 }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>TẢI CPU</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 800 }}>{node.cpu}%</Typography>
                          </Box>
                          <Divider orientation="vertical" flexItem />
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>RAM</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 800 }}>{node.memory}%</Typography>
                          </Box>
                          <Divider orientation="vertical" flexItem />
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>THIẾT BỊ WI-FI</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main' }}>{node.clientCount}</Typography>
                          </Box>
                        </Stack>

                        {/* Node Actions */}
                        <Stack direction="row" spacing={1.5}>
                          <Button
                            size="small"
                            variant="outlined"
                            color="warning"
                            startIcon={<RotateCcw size={14} />}
                            onClick={() => setConfirmWifiRestartTarget({ ip: node.ip, name: node.name })}
                          >
                            Restart Wi-Fi
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={<Power size={14} />}
                            onClick={() => setConfirmRebootTarget({ ip: node.ip, name: node.name })}
                          >
                            Reboot Node
                          </Button>
                        </Stack>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>

              {/* Connected Wi-Fi Devices Table */}
              <Card sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
                  Danh sách thiết bị kết nối Wi-Fi ({routerStatus.clients?.length || 0})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Tên thiết bị</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Địa chỉ IP</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Băng tần</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>MAC Address</TableCell>
                        <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Thao tác</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(routerStatus.clients || []).map((client, idx) => (
                        <TableRow key={idx}>
                          <TableCell sx={{ fontWeight: 700 }}>{client.name}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace' }}>{client.ip}</TableCell>
                          <TableCell>
                            <Label variant="soft" color={client.band === 'wifi50' ? 'primary' : 'warning'}>
                              {client.band === 'wifi50' ? '5 GHz' : '2.4 GHz'}
                            </Label>
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{client.mac}</TableCell>
                          <TableCell sx={{ textAlign: 'right' }}>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<Plus size={14} />}
                              onClick={() => handleOpenAddTarget(client.ip, client.name)}
                            >
                              Theo dõi
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Card>
            </Stack>
          )}
        </Box>
      )}

      {/* Target Modal Dialog (Add / Edit) */}
      <Dialog open={targetDialogOpen} onClose={() => setTargetDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSaveTarget}>
          <DialogTitle sx={{ fontWeight: 800 }}>
            {editingTarget ? 'Chỉnh sửa Target' : 'Thêm Target Giám sát'}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              <TextField
                label="Tên hiển thị"
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                placeholder="VD: Xiaomi Router, Mesh Node 2, Gateway..."
                required
                fullWidth
              />
              <TextField
                label="Địa chỉ IP hoặc Hostname"
                value={targetHost}
                onChange={(e) => setTargetHost(e.target.value)}
                placeholder="VD: 192.168.31.120 hoặc 8.8.8.8"
                required
                fullWidth
              />
              <TextField
                label="Nhóm / Tag"
                value={targetTag}
                onChange={(e) => setTargetTag(e.target.value)}
                placeholder="VD: Router, Mesh, Server, Cloud..."
                fullWidth
              />
              <TextField
                label="Khoảng thời gian ping (giây)"
                type="number"
                inputProps={{ min: 1, max: 3600 }}
                value={targetIntervalSec}
                onChange={(e) => setTargetIntervalSec(Number(e.target.value))}
                helperText="Thời gian giữa mỗi lần gửi gói tin ping (mặc định 3 giây)"
                fullWidth
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2.5 }}>
            <Button onClick={() => setTargetDialogOpen(false)}>Hủy</Button>
            <Button type="submit" variant="contained" color="primary" sx={{ fontWeight: 700 }}>
              {editingTarget ? 'Cập nhật Target' : 'Lưu Target'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Router Config Dialog */}
      <Dialog open={routerConfigOpen} onClose={() => setRouterConfigOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleSaveRouterConfig}>
          <DialogTitle sx={{ fontWeight: 800 }}>Cấu hình Xiaomi Router</DialogTitle>
          <DialogContent>
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              <TextField
                label="Địa chỉ IP Router"
                value={routerHost}
                onChange={(e) => setRouterHost(e.target.value)}
                required
                fullWidth
              />
              <TextField
                label="Mật khẩu quản trị"
                type="password"
                value={routerPassword}
                onChange={(e) => setRouterPassword(e.target.value)}
                required
                fullWidth
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2.5 }}>
            <Button onClick={() => setRouterConfigOpen(false)}>Hủy</Button>
            <Button type="submit" variant="contained" color="primary">Lưu cấu hình</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Target Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(confirmDeleteId)}
        title="Xóa Target giám sát?"
        message="Bạn có chắc chắn muốn xóa target này khỏi danh sách theo dõi?"
        onConfirm={handleDeleteTarget}
        onClose={() => setConfirmDeleteId(null)}
      />

      {/* Reboot Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(confirmRebootTarget)}
        title={`Khởi động lại ${confirmRebootTarget?.name || 'Router'}?`}
        message={`Thao tác này sẽ khởi động lại thiết bị tại địa chỉ ${confirmRebootTarget?.ip}. Kết nối mạng LAN/Wi-Fi qua node này sẽ tạm thời gián đoạn trong 1-2 phút.`}
        onConfirm={handleReboot}
        onClose={() => setConfirmRebootTarget(null)}
      />

      {/* Restart Wi-Fi Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(confirmWifiRestartTarget)}
        title={`Khởi động lại Wi-Fi ${confirmWifiRestartTarget?.name || 'Router'}?`}
        message={`Các thiết bị kết nối không dây tới ${confirmWifiRestartTarget?.ip} sẽ mất kết nối trong khoảng 15-30 giây khi module sóng khởi động lại.`}
        onConfirm={handleRestartWifi}
        onClose={() => setConfirmWifiRestartTarget(null)}
      />
    </Box>
  );
}
