import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Stack,
  Button,
  IconButton,
  Tooltip,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tabs,
  Tab,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  LinearProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Snackbar,
  Divider,
  Menu
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import {
  Play,
  Square,
  RotateCw,
  Pause,
  Trash2,
  Terminal,
  FileText,
  Boxes,
  Layers,
  HardDrive,
  Cpu,
  Server,
  Search,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Info,
  Download,
  Trash,
  CheckCircle2,
  AlertCircle,
  Clock,
  MoreVertical
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../utils/api';

export default function DockerView() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { token, isSuperAdmin } = useAuth();

  const [currentTab, setCurrentTab] = useState('containers');
  const [hosts, setHosts] = useState([{ id: 'local', name: 'Máy Chủ Trung Tâm (Local Docker)', available: true, isLocal: true }]);
  const [selectedHostId, setSelectedHostId] = useState('local');
  const [hostInfo, setHostInfo] = useState(null);
  
  const [containers, setContainers] = useState([]);
  const [images, setImages] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [stacks, setStacks] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Modals state
  const [logsModal, setLogsModal] = useState({ open: false, container: null, logs: '', isStreaming: false });
  const [terminalModal, setTerminalModal] = useState({ open: false, container: null, execId: null });
  const [inspectModal, setInspectModal] = useState({ open: false, container: null, data: null });
  const [actionLoading, setActionLoading] = useState({});
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });

  // Terminal input state
  const [termInput, setTermInput] = useState('');
  const [termHistory, setTermHistory] = useState([]);
  const termSocketRef = useRef(null);
  const logSocketRef = useRef(null);
  const logsEndRef = useRef(null);
  const termEndRef = useRef(null);

  // Load Docker Hosts
  const loadHosts = async () => {
    try {
      const res = await apiRequest('/api/v1/docker/hosts');
      if (res?.hosts?.length) {
        setHosts(res.hosts);
      }
    } catch (err) {
      console.error('Failed to load docker hosts:', err);
    }
  };

  // Load Host Data
  const loadData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const [infoRes, containersRes, stacksRes, imagesRes, volumesRes] = await Promise.all([
        apiRequest(`/api/v1/docker/${selectedHostId}/info`).catch(() => ({ available: false })),
        apiRequest(`/api/v1/docker/${selectedHostId}/containers?all=true`).catch(() => ({ containers: [] })),
        apiRequest(`/api/v1/docker/${selectedHostId}/stacks`).catch(() => ({ stacks: [] })),
        apiRequest(`/api/v1/docker/${selectedHostId}/images`).catch(() => ({ images: [] })),
        apiRequest(`/api/v1/docker/${selectedHostId}/volumes`).catch(() => ({ volumes: [] }))
      ]);

      setHostInfo(infoRes);
      setContainers(containersRes.containers || []);
      setStacks(stacksRes.stacks || []);
      setImages(imagesRes.images || []);
      setVolumes(volumesRes.volumes || []);
    } catch (err) {
      setToast({ open: true, message: `Lỗi tải dữ liệu Docker: ${err.message}`, severity: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadHosts();
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 10000);
    return () => clearInterval(interval);
  }, [selectedHostId]);

  // Container Action Handler
  const handleContainerAction = async (containerId, action, name = '') => {
    setActionLoading((prev) => ({ ...prev, [containerId]: action }));
    try {
      await apiRequest(`/api/v1/docker/${selectedHostId}/containers/${containerId}/action`, {
        method: 'POST',
        body: JSON.stringify({ action })
      });
      setToast({
        open: true,
        message: `Đã thực hiện lệnh [${action.toUpperCase()}] thành công trên container ${name || containerId.slice(0, 12)}`,
        severity: 'success'
      });
      loadData(true);
    } catch (err) {
      setToast({ open: true, message: `Lỗi thao tác container: ${err.message}`, severity: 'error' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [containerId]: null }));
    }
  };

  // Live Logs Handler
  const handleOpenLogs = (container) => {
    setLogsModal({ open: true, container, logs: '', isStreaming: true });
    
    // Connect WebSocket for live streaming
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/docker/logs?containerId=${container.id}&token=${token}&tail=200`;
    
    if (logSocketRef.current) logSocketRef.current.close();
    const ws = new WebSocket(wsUrl);
    logSocketRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'docker.log' && data.log) {
          setLogsModal((prev) => ({ ...prev, logs: prev.logs + data.log }));
        }
      } catch {
        setLogsModal((prev) => ({ ...prev, logs: prev.logs + event.data }));
      }
    };

    ws.onerror = (err) => {
      console.error('Logs WS error:', err);
    };

    ws.onclose = () => {
      setLogsModal((prev) => ({ ...prev, isStreaming: false }));
    };
  };

  const handleCloseLogs = () => {
    if (logSocketRef.current) {
      logSocketRef.current.close();
      logSocketRef.current = null;
    }
    setLogsModal({ open: false, container: null, logs: '', isStreaming: false });
  };

  // Interactive Web Terminal Handler
  const handleOpenTerminal = async (container) => {
    try {
      const res = await apiRequest(`/api/v1/docker/${selectedHostId}/containers/${container.id}/exec`, {
        method: 'POST',
        body: JSON.stringify({ cmd: ['/bin/sh'] })
      });

      if (!res?.execId) throw new Error('Không thể khởi tạo phiên exec');

      setTerminalModal({ open: true, container, execId: res.execId });
      setTermHistory([
        `[MinhHungOps Docker Console - Container: ${container.name}]`,
        `Đang kết nối shell tương tác /bin/sh...`,
        `Gõ 'exit' để đóng hoặc nhập lệnh Linux tiêu chuẩn.\n`
      ]);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/docker/exec?execId=${res.execId}&token=${token}`;

      if (termSocketRef.current) termSocketRef.current.close();
      const ws = new WebSocket(wsUrl);
      termSocketRef.current = ws;

      ws.onmessage = (event) => {
        setTermHistory((prev) => [...prev, event.data]);
      };

      ws.onclose = () => {
        setTermHistory((prev) => [...prev, '\n[Phiên Terminal đã kết thúc]']);
      };
    } catch (err) {
      setToast({ open: true, message: `Lỗi mở Terminal: ${err.message}`, severity: 'error' });
    }
  };

  const handleCloseTerminal = () => {
    if (termSocketRef.current) {
      termSocketRef.current.close();
      termSocketRef.current = null;
    }
    setTerminalModal({ open: false, container: null, execId: null });
    setTermInput('');
  };

  const handleSendTermCommand = (e) => {
    e.preventDefault();
    if (!termInput.trim() || !termSocketRef.current) return;
    termSocketRef.current.send(termInput + '\n');
    setTermInput('');
  };

  // Inspect Container Handler
  const handleOpenInspect = async (container) => {
    try {
      const data = await apiRequest(`/api/v1/docker/${selectedHostId}/containers/${container.id}`);
      setInspectModal({ open: true, container, data });
    } catch (err) {
      setToast({ open: true, message: `Lỗi inspect container: ${err.message}`, severity: 'error' });
    }
  };

  // Prune Images
  const handlePruneImages = async () => {
    if (!window.confirm('Bạn có chắc muốn dọn dẹp toàn bộ Image rác (dangling images) không?')) return;
    try {
      const res = await apiRequest(`/api/v1/docker/${selectedHostId}/images/prune`, { method: 'POST' });
      const reclaimed = res?.result?.SpaceReclaimed || 0;
      setToast({
        open: true,
        message: `Đã dọn dẹp images rác thành công. Giải phóng ${(reclaimed / (1024 * 1024)).toFixed(2)} MB.`,
        severity: 'success'
      });
      loadData(true);
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    }
  };

  // Prune Volumes
  const handlePruneVolumes = async () => {
    if (!window.confirm('Bạn có chắc muốn dọn dẹp các Volume không còn gắn với container nào không?')) return;
    try {
      const res = await apiRequest(`/api/v1/docker/${selectedHostId}/volumes/prune`, { method: 'POST' });
      const reclaimed = res?.result?.SpaceReclaimed || 0;
      setToast({
        open: true,
        message: `Đã dọn dẹp volumes rác thành công. Giải phóng ${(reclaimed / (1024 * 1024)).toFixed(2)} MB.`,
        severity: 'success'
      });
      loadData(true);
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    }
  };

  // Filtered containers
  const filteredContainers = useMemo(() => {
    return containers.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.image.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.id.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;
      if (statusFilter === 'running') return c.state === 'running';
      if (statusFilter === 'stopped') return c.state === 'exited' || c.state === 'dead';
      if (statusFilter === 'paused') return c.state === 'paused';
      return true;
    });
  }, [containers, searchQuery, statusFilter]);

  // Status stats
  const runningCount = containers.filter((c) => c.state === 'running').length;
  const stoppedCount = containers.filter((c) => c.state === 'exited' || c.state === 'dead').length;
  const pausedCount = containers.filter((c) => c.state === 'paused').length;

  return (
    <Box sx={{ pb: 6 }}>
      {/* Header & Host Selector */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        alignItems={{ xs: 'flex-start', md: 'center' }}
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>
              Quản Lý Docker Fleet
            </Typography>
            <Chip
              icon={<Boxes size={15} />}
              label="Dockhand Pro"
              size="small"
              sx={{
                bgcolor: alpha(theme.palette.primary.main, 0.12),
                color: 'primary.main',
                fontWeight: 700
              }}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Giám sát vòng đời container, xem live logs, mở interactive terminal và quản lý stacks trên Local & mạng LAN.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center">
          {/* Host Selector */}
          <FormControl size="small" sx={{ minWidth: 260 }}>
            <InputLabel>Node / Máy Chủ Docker</InputLabel>
            <Select
              value={selectedHostId}
              label="Node / Máy Chủ Docker"
              onChange={(e) => setSelectedHostId(e.target.value)}
            >
              {hosts.map((h) => (
                <MenuItem key={h.id} value={h.id}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: h.available ? 'success.main' : 'text.disabled'
                      }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {h.name}
                    </Typography>
                    {h.isLocal && (
                      <Chip label="Local" size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                    )}
                  </Stack>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            startIcon={<RefreshCw size={16} className={refreshing ? 'spin' : ''} />}
            onClick={() => loadData(true)}
            sx={{ borderRadius: 2 }}
          >
            Làm mới
          </Button>
        </Stack>
      </Stack>

      {/* Host Availability Banner */}
      {hostInfo && !hostInfo.available && (
        <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>
          Không thể kết nối đến Docker daemon trên node này. Hãy chắc chắn Docker đang chạy hoặc socket đã được mount.
        </Alert>
      )}

      {/* Summary KPI Cards */}
      <Grid container spacing={2.5} sx={{ mb: 3.5 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, boxShadow: theme.shadows[1] }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  Tổng Containers
                </Typography>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.1) }}>
                  <Boxes size={20} color={theme.palette.primary.main} />
                </Box>
              </Stack>
              <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>
                {containers.length}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Chip label={`${runningCount} Đang chạy`} size="small" color="success" sx={{ height: 20, fontSize: 11 }} />
                <Chip label={`${stoppedCount} Dừng`} size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, boxShadow: theme.shadows[1] }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  Compose Stacks
                </Typography>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(theme.palette.info.main, 0.1) }}>
                  <Layers size={20} color={theme.palette.info.main} />
                </Box>
              </Stack>
              <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>
                {stacks.length}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Nhóm dịch vụ compose đang quản lý
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, boxShadow: theme.shadows[1] }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  Docker Images
                </Typography>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(theme.palette.secondary.main, 0.1) }}>
                  <Server size={20} color={theme.palette.secondary.main} />
                </Box>
              </Stack>
              <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>
                {images.length}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Tổng số images trên máy chủ
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, boxShadow: theme.shadows[1] }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  Volumes Lưu Trữ
                </Typography>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(theme.palette.warning.main, 0.1) }}>
                  <HardDrive size={20} color={theme.palette.warning.main} />
                </Box>
              </Stack>
              <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>
                {volumes.length}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Persistent storage volumes
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Main Tabs Navigation */}
      <Card sx={{ borderRadius: 3, overflow: 'hidden', boxShadow: theme.shadows[1] }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2.5, pt: 1.5 }}>
          <Tabs
            value={currentTab}
            onChange={(e, val) => setCurrentTab(val)}
            textColor="primary"
            indicatorColor="primary"
          >
            <Tab
              value="containers"
              label={`Containers (${containers.length})`}
              icon={<Boxes size={18} />}
              iconPosition="start"
              sx={{ fontWeight: 700 }}
            />
            <Tab
              value="stacks"
              label={`Compose Stacks (${stacks.length})`}
              icon={<Layers size={18} />}
              iconPosition="start"
              sx={{ fontWeight: 700 }}
            />
            <Tab
              value="images"
              label={`Images (${images.length})`}
              icon={<Server size={18} />}
              iconPosition="start"
              sx={{ fontWeight: 700 }}
            />
            <Tab
              value="volumes"
              label={`Volumes (${volumes.length})`}
              icon={<HardDrive size={18} />}
              iconPosition="start"
              sx={{ fontWeight: 700 }}
            />
          </Tabs>
        </Box>

        {/* Tab 1: Containers Management */}
        {currentTab === 'containers' && (
          <Box sx={{ p: 2.5 }}>
            {/* Filter Bar */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2.5 }} justifyContent="space-between">
              <TextField
                size="small"
                placeholder="Tìm kiếm container, image hoặc ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                sx={{ width: { xs: '100%', sm: 320 } }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={18} />
                    </InputAdornment>
                  )
                }}
              />

              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  size="small"
                  variant={statusFilter === 'all' ? 'contained' : 'outlined'}
                  onClick={() => setStatusFilter('all')}
                  sx={{ borderRadius: 2, textTransform: 'none' }}
                >
                  Tất cả ({containers.length})
                </Button>
                <Button
                  size="small"
                  variant={statusFilter === 'running' ? 'contained' : 'outlined'}
                  color="success"
                  onClick={() => setStatusFilter('running')}
                  sx={{ borderRadius: 2, textTransform: 'none' }}
                >
                  Đang chạy ({runningCount})
                </Button>
                <Button
                  size="small"
                  variant={statusFilter === 'stopped' ? 'contained' : 'outlined'}
                  color="inherit"
                  onClick={() => setStatusFilter('stopped')}
                  sx={{ borderRadius: 2, textTransform: 'none' }}
                >
                  Đã dừng ({stoppedCount})
                </Button>
              </Stack>
            </Stack>

            {/* Containers Table */}
            <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
              <Table size="medium">
                <TableHead sx={{ bgcolor: alpha(theme.palette.primary.main, 0.03) }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Tên Container / Stack</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Trạng thái</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Image</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Port Mappings</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Thao tác nhanh</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && !containers.length ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                        <CircularProgress size={32} />
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                          Đang đọc danh sách containers từ Docker daemon...
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : filteredContainers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          Không tìm thấy container nào phù hợp.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredContainers.map((c) => {
                      const isRunning = c.state === 'running';
                      const isPaused = c.state === 'paused';
                      const currentAction = actionLoading[c.id];

                      return (
                        <TableRow key={c.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                          {/* Name & Stack */}
                          <TableCell>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <Box
                                sx={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: '50%',
                                  bgcolor: isRunning ? 'success.main' : isPaused ? 'warning.main' : 'text.disabled'
                                }}
                              />
                              <Box>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                  {c.name}
                                </Typography>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
                                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                    {c.shortId}
                                  </Typography>
                                  {c.composeProject && (
                                    <Chip
                                      label={`Stack: ${c.composeProject}`}
                                      size="small"
                                      variant="outlined"
                                      sx={{ height: 18, fontSize: 10 }}
                                    />
                                  )}
                                </Stack>
                              </Box>
                            </Stack>
                          </TableCell>

                          {/* Status */}
                          <TableCell>
                            <Chip
                              label={c.status}
                              size="small"
                              color={isRunning ? 'success' : isPaused ? 'warning' : 'default'}
                              variant={isRunning ? 'filled' : 'outlined'}
                              sx={{ fontWeight: 600, fontSize: 11 }}
                            />
                          </TableCell>

                          {/* Image */}
                          <TableCell>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }} noWrap>
                              {c.image}
                            </Typography>
                          </TableCell>

                          {/* Ports */}
                          <TableCell>
                            {c.ports?.length ? (
                              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                {c.ports.slice(0, 3).map((p, idx) => (
                                  <Chip
                                    key={idx}
                                    label={p.publicPort ? `${p.publicPort}:${p.privatePort}` : `${p.privatePort}/${p.type}`}
                                    size="small"
                                    sx={{ height: 20, fontSize: 10, fontFamily: 'monospace' }}
                                  />
                                ))}
                                {c.ports.length > 3 && (
                                  <Chip label={`+${c.ports.length - 3}`} size="small" sx={{ height: 20, fontSize: 10 }} />
                                )}
                              </Stack>
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                —
                              </Typography>
                            )}
                          </TableCell>

                          {/* Actions */}
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.75} justifyContent="flex-end" alignItems="center">
                              {/* Start / Stop / Restart */}
                              {isRunning ? (
                                <>
                                  <Tooltip title="Restart Container">
                                    <IconButton
                                      size="small"
                                      color="primary"
                                      disabled={Boolean(currentAction)}
                                      onClick={() => handleContainerAction(c.id, 'restart', c.name)}
                                    >
                                      <RotateCw size={16} />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Stop Container">
                                    <IconButton
                                      size="small"
                                      color="warning"
                                      disabled={Boolean(currentAction)}
                                      onClick={() => handleContainerAction(c.id, 'stop', c.name)}
                                    >
                                      <Square size={16} />
                                    </IconButton>
                                  </Tooltip>
                                </>
                              ) : (
                                <Tooltip title="Start Container">
                                  <IconButton
                                    size="small"
                                    color="success"
                                    disabled={Boolean(currentAction)}
                                    onClick={() => handleContainerAction(c.id, 'start', c.name)}
                                  >
                                    <Play size={16} />
                                  </IconButton>
                                </Tooltip>
                              )}

                              {/* Live Logs */}
                              <Tooltip title="Live Logs">
                                <IconButton size="small" color="info" onClick={() => handleOpenLogs(c)}>
                                  <FileText size={16} />
                                </IconButton>
                              </Tooltip>

                              {/* Interactive Terminal (Exec) */}
                              {isRunning && (
                                <Tooltip title="Web Terminal (Exec /bin/sh)">
                                  <IconButton size="small" color="secondary" onClick={() => handleOpenTerminal(c)}>
                                    <Terminal size={16} />
                                  </IconButton>
                                </Tooltip>
                              )}

                              {/* Inspect Details */}
                              <Tooltip title="Inspect Details">
                                <IconButton size="small" onClick={() => handleOpenInspect(c)}>
                                  <Info size={16} />
                                </IconButton>
                              </Tooltip>

                              {/* Remove */}
                              {!isRunning && (
                                <Tooltip title="Xoá Container">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    disabled={Boolean(currentAction)}
                                    onClick={() => {
                                      if (window.confirm(`Xoá container [${c.name}] vĩnh viễn?`)) {
                                        handleContainerAction(c.id, 'remove', c.name);
                                      }
                                    }}
                                  >
                                    <Trash2 size={16} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Tab 2: Stacks Management */}
        {currentTab === 'stacks' && (
          <Box sx={{ p: 2.5 }}>
            <Grid container spacing={2.5}>
              {stacks.map((st) => (
                <Grid item xs={12} md={6} key={st.name}>
                  <Card variant="outlined" sx={{ borderRadius: 2.5, p: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.1) }}>
                          <Layers size={20} color={theme.palette.primary.main} />
                        </Box>
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {st.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {st.runningCount} / {st.totalCount} containers đang chạy
                          </Typography>
                        </Box>
                      </Stack>
                    </Stack>

                    <Divider sx={{ my: 1.5 }} />

                    <Stack spacing={1}>
                      {st.containers.map((sc) => (
                        <Stack key={sc.id} direction="row" justifyContent="space-between" alignItems="center">
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                bgcolor: sc.state === 'running' ? 'success.main' : 'text.disabled'
                              }}
                            />
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {sc.name}
                            </Typography>
                          </Stack>
                          <Chip label={sc.state} size="small" variant="outlined" sx={{ height: 20, fontSize: 10 }} />
                        </Stack>
                      ))}
                    </Stack>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {/* Tab 3: Images Management */}
        {currentTab === 'images' && (
          <Box sx={{ p: 2.5 }}>
            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
              <Button
                variant="outlined"
                color="warning"
                startIcon={<Trash size={16} />}
                onClick={handlePruneImages}
                sx={{ borderRadius: 2 }}
              >
                Dọn Dẹp Images Rác (Prune)
              </Button>
            </Stack>

            <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
              <Table size="medium">
                <TableHead sx={{ bgcolor: alpha(theme.palette.primary.main, 0.03) }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Image Tag</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>ID</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Dung Lượng</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Containers Sử Dụng</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {images.map((img) => (
                    <TableRow key={img.id} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{img.primaryTag}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{img.shortId}</TableCell>
                      <TableCell>{(img.sizeBytes / (1024 * 1024)).toFixed(1)} MB</TableCell>
                      <TableCell>{img.containersCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Tab 4: Volumes Management */}
        {currentTab === 'volumes' && (
          <Box sx={{ p: 2.5 }}>
            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
              <Button
                variant="outlined"
                color="warning"
                startIcon={<Trash size={16} />}
                onClick={handlePruneVolumes}
                sx={{ borderRadius: 2 }}
              >
                Dọn Dẹp Volumes Thừa (Prune)
              </Button>
            </Stack>

            <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
              <Table size="medium">
                <TableHead sx={{ bgcolor: alpha(theme.palette.primary.main, 0.03) }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Tên Volume</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Driver</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Mountpoint</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Scope</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {volumes.map((vol) => (
                    <TableRow key={vol.name} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{vol.name}</TableCell>
                      <TableCell>{vol.driver}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11, color: 'text.secondary' }}>{vol.mountpoint}</TableCell>
                      <TableCell>{vol.scope}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Card>

      {/* ========================================== */}
      {/* Modal 1: Live Logs Dialog                  */}
      {/* ========================================== */}
      <Dialog
        open={logsModal.open}
        onClose={handleCloseLogs}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, bgcolor: '#111827', color: '#F3F4F6' } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <FileText size={20} color="#60A5FA" />
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
              Live Logs: {logsModal.container?.name}
            </Typography>
            {logsModal.isStreaming && (
              <Chip label="Streaming" size="small" color="success" sx={{ height: 20, fontSize: 11 }} />
            )}
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              startIcon={<Download size={14} />}
              onClick={() => {
                const blob = new Blob([logsModal.logs], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${logsModal.container?.name || 'docker'}-logs.log`;
                a.click();
              }}
              sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }}
            >
              Tải Logs
            </Button>
            <Button size="small" variant="contained" onClick={handleCloseLogs} sx={{ bgcolor: 'rgba(255,255,255,0.15)' }}>
              Đóng
            </Button>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ p: 2 }}>
          <Box
            sx={{
              p: 2,
              bgcolor: '#030712',
              borderRadius: 2,
              fontFamily: 'Consolas, Monaco, monospace',
              fontSize: 13,
              lineHeight: 1.6,
              color: '#4ADE80',
              maxHeight: '60vh',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}
          >
            {logsModal.logs || 'Đang chờ luồng log từ container...'}
            <div ref={logsEndRef} />
          </Box>
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* Modal 2: Interactive Terminal Dialog       */}
      {/* ========================================== */}
      <Dialog
        open={terminalModal.open}
        onClose={handleCloseTerminal}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, bgcolor: '#0D1117', color: '#C9D1D9' } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Terminal size={20} color="#58A6FF" />
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
              Web Console / Exec: {terminalModal.container?.name}
            </Typography>
          </Stack>
          <Button size="small" variant="contained" onClick={handleCloseTerminal} sx={{ bgcolor: 'rgba(255,255,255,0.15)' }}>
            Đóng Console
          </Button>
        </DialogTitle>
        <DialogContent sx={{ p: 2 }}>
          <Box
            sx={{
              p: 2,
              bgcolor: '#010409',
              borderRadius: 2,
              fontFamily: 'Consolas, Monaco, monospace',
              fontSize: 13,
              lineHeight: 1.5,
              color: '#38BDF8',
              height: '50vh',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              mb: 2
            }}
          >
            {termHistory.join('')}
            <div ref={termEndRef} />
          </Box>

          <form onSubmit={handleSendTermCommand}>
            <Stack direction="row" spacing={1}>
              <TextField
                fullWidth
                size="small"
                placeholder="Nhập lệnh shell (vd: ls -la, ps aux, cat /etc/os-release)..."
                value={termInput}
                onChange={(e) => setTermInput(e.target.value)}
                sx={{
                  bgcolor: 'rgba(255,255,255,0.05)',
                  borderRadius: 1.5,
                  '& input': { color: '#fff', fontFamily: 'monospace' }
                }}
              />
              <Button type="submit" variant="contained" color="primary" sx={{ px: 3 }}>
                Gửi
              </Button>
            </Stack>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* Modal 3: Inspect Details Dialog            */}
      {/* ========================================== */}
      <Dialog
        open={inspectModal.open}
        onClose={() => setInspectModal({ open: false, container: null, data: null })}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Chi Tiết Cấu Hình Container: {inspectModal.container?.name}
        </DialogTitle>
        <DialogContent dividers>
          {inspectModal.data && (
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  Thông tin cơ bản
                </Typography>
                <Grid container spacing={1} sx={{ mt: 0.5 }}>
                  <Grid item xs={6}>
                    <Typography variant="body2"><strong>ID:</strong> {inspectModal.data.id}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2"><strong>Image:</strong> {inspectModal.data.image}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2"><strong>IP Address:</strong> {inspectModal.data.networkSettings?.ipAddress || 'Host Network'}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2"><strong>Restart Policy:</strong> {inspectModal.data.restartPolicy}</Typography>
                  </Grid>
                </Grid>
              </Box>

              <Divider />

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  Mounts / Volumes ({inspectModal.data.mounts?.length || 0})
                </Typography>
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                  {inspectModal.data.mounts?.map((m, idx) => (
                    <Box key={idx} sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5, fontFamily: 'monospace', fontSize: 12 }}>
                      {m.source} ➔ {m.destination} ({m.mode})
                    </Box>
                  ))}
                </Stack>
              </Box>

              <Divider />

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  Biến Môi Trường (Environment Variables)
                </Typography>
                <Box sx={{ maxHeight: 200, overflowY: 'auto', mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                  {inspectModal.data.env?.map((e, idx) => (
                    <Typography key={idx} variant="caption" sx={{ display: 'block', fontFamily: 'monospace' }}>
                      <strong>{e.key}=</strong>{e.value}
                    </Typography>
                  ))}
                </Box>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setInspectModal({ open: false, container: null, data: null })}>
            Đóng
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar Notifications */}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={toast.severity} onClose={() => setToast((prev) => ({ ...prev, open: false }))} variant="filled">
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
