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
  CircularProgress,
  LinearProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Snackbar,
  Divider,
  Collapse,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import {
  Play,
  Square,
  RotateCw,
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
  Info,
  Download,
  Trash,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  List as ListIcon
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../utils/api';

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function DockerView() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin';
  const canManage = isSuperAdmin || isAdmin;

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

  // Grouping & Sorting State
  const [viewMode, setViewMode] = useState('grouped'); // 'grouped' or 'flat'
  const [sortBy, setSortBy] = useState('name'); // 'name', 'cpu', 'memory', 'status'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' or 'desc'
  const [collapsedStacks, setCollapsedStacks] = useState(new Set());

  // Modals state
  const [detailModal, setDetailModal] = useState({ open: false, container: null, data: null, activeSubTab: 'overview' });
  const [modalLogs, setModalLogs] = useState({ logs: '', isStreaming: false });
  const [modalTerm, setModalTerm] = useState({ execId: null, history: '', input: '', isConnected: false });

  const [actionLoading, setActionLoading] = useState({});
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });

  const logSocketRef = useRef(null);
  const termSocketRef = useRef(null);
  const logsEndRef = useRef(null);
  const termEndRef = useRef(null);

  // Load Docker Hosts
  const loadHosts = async () => {
    try {
      const res = await apiRequest('/api/v1/docker/hosts');
      if (res?.hosts !== undefined) {
        setHosts(res.hosts);
        if (res.hosts.length > 0) {
          setSelectedHostId((prev) => {
            const exists = res.hosts.some((h) => h.id === prev);
            return exists ? prev : res.hosts[0].id;
          });
        } else {
          setSelectedHostId('');
        }
      }
    } catch (err) {
      console.error('Failed to load docker hosts:', err);
    }
  };

  // Load Host Data
  const loadData = async (isSilent = false) => {
    if (!selectedHostId) {
      setHostInfo(null);
      setContainers([]);
      setStacks([]);
      setImages([]);
      setVolumes([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const [infoRes, containersRes, stacksRes, imagesRes, volumesRes] = await Promise.all([
        apiRequest(`/api/v1/docker/${selectedHostId}/info`).catch(() => ({ available: false })),
        apiRequest(`/api/v1/docker/${selectedHostId}/containers?all=true&withStats=true`).catch(() => ({ containers: [] })),
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
    const interval = setInterval(() => loadData(true), 6000);
    return () => clearInterval(interval);
  }, [selectedHostId]);

  // Auto-scroll Logs & Terminal
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [modalLogs.logs]);

  useEffect(() => {
    if (termEndRef.current) {
      termEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [modalTerm.history]);

  // Container Action Handler
  const handleContainerAction = async (e, containerId, action, name = '') => {
    if (e) e.stopPropagation();
    setActionLoading((prev) => ({ ...prev, [containerId]: action }));
    try {
      await apiRequest(`/api/v1/docker/${selectedHostId}/containers/${containerId}/action`, {
        method: 'POST',
        body: JSON.stringify({ action })
      });
      setToast({
        open: true,
        message: `Đã thực hiện [${action.toUpperCase()}] thành công trên container ${name || containerId.slice(0, 12)}`,
        severity: 'success'
      });
      loadData(true);
    } catch (err) {
      setToast({ open: true, message: `Lỗi thao tác: ${err.message}`, severity: 'error' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [containerId]: null }));
    }
  };

  // Stack Action (Restart all containers in stack)
  const handleStackAction = async (e, stack, action) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Bạn có chắc muốn ${action.toUpperCase()} toàn bộ Stack [${stack.name}] (${stack.containers.length} containers)?`)) return;

    for (const c of stack.containers) {
      try {
        await apiRequest(`/api/v1/docker/${selectedHostId}/containers/${c.id}/action`, {
          method: 'POST',
          body: JSON.stringify({ action })
        });
      } catch { }
    }
    setToast({ open: true, message: `Đã gửi lệnh [${action.toUpperCase()}] cho Stack ${stack.name}`, severity: 'success' });
    loadData(true);
  };

  // Toggle Single Stack
  const toggleStackCollapse = (stackName) => {
    setCollapsedStacks((prev) => {
      const next = new Set(prev);
      if (next.has(stackName)) next.delete(stackName);
      else next.add(stackName);
      return next;
    });
  };

  // Expand / Collapse All Stacks
  const handleExpandAllStacks = () => setCollapsedStacks(new Set());
  const handleCollapseAllStacks = () => {
    const allNames = stacks.map((s) => s.name);
    setCollapsedStacks(new Set(allNames));
  };

  // Open Container Detail Dialog
  const handleOpenContainerDetail = async (container, initialTab = 'overview') => {
    setDetailModal({ open: true, container, data: null, activeSubTab: initialTab });
    try {
      const data = await apiRequest(`/api/v1/docker/${selectedHostId}/containers/${container.id}`);
      setDetailModal((prev) => ({ ...prev, data }));
    } catch (err) {
      setToast({ open: true, message: `Lỗi tải chi tiết: ${err.message}`, severity: 'error' });
    }

    if (initialTab === 'logs') {
      startLogsStream(container.id);
    } else if (initialTab === 'terminal') {
      startTerminalSession(container);
    }
  };

  const handleCloseDetailModal = () => {
    stopLogsStream();
    stopTerminalSession();
    setDetailModal({ open: false, container: null, data: null, activeSubTab: 'overview' });
  };

  const handleSubTabChange = (val) => {
    setDetailModal((prev) => ({ ...prev, activeSubTab: val }));
    if (val === 'logs' && detailModal.container) {
      startLogsStream(detailModal.container.id);
    } else if (val !== 'logs') {
      stopLogsStream();
    }

    if (val === 'terminal' && detailModal.container) {
      startTerminalSession(detailModal.container);
    } else if (val !== 'terminal') {
      stopTerminalSession();
    }
  };

  // Live Logs Stream
  const startLogsStream = async (containerId) => {
    stopLogsStream();
    setModalLogs({ logs: 'Đang kết nối luồng log container...', isStreaming: true });

    try {
      const res = await apiRequest(`/api/v1/docker/${selectedHostId}/containers/${containerId}/logs?tail=200`);
      if (res?.logs) {
        setModalLogs((prev) => ({ ...prev, logs: res.logs }));
      }
    } catch { }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/docker/logs?containerId=${containerId}&token=${token}&tail=50`;

    const ws = new WebSocket(wsUrl);
    logSocketRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'docker.log' && data.log) {
          setModalLogs((prev) => ({ ...prev, logs: prev.logs + data.log }));
        }
      } catch {
        setModalLogs((prev) => ({ ...prev, logs: prev.logs + event.data }));
      }
    };

    ws.onclose = () => {
      setModalLogs((prev) => ({ ...prev, isStreaming: false }));
    };
  };

  const stopLogsStream = () => {
    if (logSocketRef.current) {
      try { logSocketRef.current.close(); } catch { }
      logSocketRef.current = null;
    }
    setModalLogs({ logs: '', isStreaming: false });
  };

  // Web Terminal Session
  const startTerminalSession = async (container) => {
    stopTerminalSession();
    setModalTerm({
      execId: null,
      history: `[NMH Ops Controller Shell: ${container.name}]\r\nĐang kết nối terminal...\r\n`,
      input: '',
      isConnected: false
    });

    try {
      const res = await apiRequest(`/api/v1/docker/${selectedHostId}/containers/${container.id}/exec`, {
        method: 'POST',
        body: JSON.stringify({ cmd: ['/bin/sh'] })
      });

      if (!res?.execId) throw new Error('Không thể tạo phiên exec');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/docker/exec?execId=${res.execId}&token=${token}`;
      const ws = new WebSocket(wsUrl);
      termSocketRef.current = ws;

      ws.onopen = () => {
        setModalTerm((prev) => ({
          ...prev,
          execId: res.execId,
          isConnected: true
        }));
      };

      ws.onmessage = (event) => {
        setModalTerm((prev) => ({
          ...prev,
          history: prev.history + event.data
        }));
      };

      ws.onclose = () => {
        setModalTerm((prev) => ({
          ...prev,
          isConnected: false,
          history: prev.history + '\r\n[Phiên Terminal đã kết thúc]\r\n'
        }));
      };
    } catch (err) {
      setModalTerm((prev) => ({
        ...prev,
        isConnected: false,
        history: prev.history + `\r\n[Lỗi kết nối Shell]: ${err.message}\r\n`
      }));
    }
  };

  const stopTerminalSession = () => {
    if (termSocketRef.current) {
      try { termSocketRef.current.close(); } catch { }
      termSocketRef.current = null;
    }
    setModalTerm({ execId: null, history: '', input: '', isConnected: false });
  };

  const handleSendTermCommand = (e) => {
    e.preventDefault();
    if (!termSocketRef.current || termSocketRef.current.readyState !== WebSocket.OPEN) return;
    const cmd = modalTerm.input;
    termSocketRef.current.send(cmd + '\n');
    setModalTerm((prev) => ({ ...prev, input: '' }));
  };

  // Prune Images
  const handlePruneImages = async () => {
    if (!window.confirm('Bạn có chắc muốn dọn dẹp toàn bộ Image rác (dangling images) không?')) return;
    try {
      const res = await apiRequest(`/api/v1/docker/${selectedHostId}/images/prune`, { method: 'POST' });
      const reclaimed = res?.result?.SpaceReclaimed || 0;
      setToast({
        open: true,
        message: `Đã dọn dẹp images rác thành công. Giải phóng ${formatBytes(reclaimed)}.`,
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
        message: `Đã dọn dẹp volumes rác thành công. Giải phóng ${formatBytes(reclaimed)}.`,
        severity: 'success'
      });
      loadData(true);
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    }
  };

  // Sorted & Filtered Containers
  const sortedAndFilteredContainers = useMemo(() => {
    const filtered = containers.filter((c) => {
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

    return filtered.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortBy === 'cpu') {
        const aCpu = a.stats?.cpuPercent || 0;
        const bCpu = b.stats?.cpuPercent || 0;
        cmp = aCpu - bCpu;
      } else if (sortBy === 'memory') {
        const aMem = a.stats?.memUsageBytes || a.stats?.memUsage || 0;
        const bMem = b.stats?.memUsageBytes || b.stats?.memUsage || 0;
        cmp = aMem - bMem;
      } else if (sortBy === 'status') {
        const stateOrder = { running: 3, paused: 2, exited: 1, dead: 0 };
        cmp = (stateOrder[a.state] || 0) - (stateOrder[b.state] || 0);
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [containers, searchQuery, statusFilter, sortBy, sortOrder]);

  // Grouped by Stack with full multi-criteria sorting
  const groupedStacks = useMemo(() => {
    const map = new Map();
    for (const c of sortedAndFilteredContainers) {
      const rawPName = c.composeProject || c.stack || c.labels?.['com.docker.compose.project'] || c.labels?.['io.portainer.stack.name'] || '_standalone';
      const isStandalone = !rawPName || rawPName === '_standalone' || rawPName.toLowerCase() === 'standalone';
      const pName = isStandalone ? '_standalone' : rawPName;

      if (!map.has(pName)) {
        map.set(pName, {
          name: pName,
          isStandalone,
          containers: [],
          runningCount: 0,
          totalCount: 0,
          totalCpuPercent: 0,
          totalMemUsageBytes: 0,
          totalMemLimitBytes: 0
        });
      }
      const st = map.get(pName);
      st.containers.push(c);
      st.totalCount += 1;
      if (c.state === 'running') {
        const cpu = c.stats?.cpuPercent || 0;
        const memUsage = c.stats?.memUsageBytes || c.stats?.memUsage || 0;
        const memLimit = c.stats?.memLimitBytes || c.stats?.memLimit || 0;
        st.runningCount += 1;
        st.totalCpuPercent += cpu;
        st.totalMemUsageBytes += memUsage;
        if (memLimit > st.totalMemLimitBytes) {
          st.totalMemLimitBytes = memLimit;
        }
      }
    }

    // Sort stacks themselves based on selected sortBy & sortOrder
    return Array.from(map.values()).sort((a, b) => {
      if (a.isStandalone && !b.isStandalone) return 1;
      if (!a.isStandalone && b.isStandalone) return -1;

      let cmp = 0;
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortBy === 'cpu') {
        cmp = (a.totalCpuPercent || 0) - (b.totalCpuPercent || 0);
      } else if (sortBy === 'memory') {
        cmp = (a.totalMemUsageBytes || 0) - (b.totalMemUsageBytes || 0);
      } else if (sortBy === 'status') {
        cmp = (a.runningCount / (a.totalCount || 1)) - (b.runningCount / (b.totalCount || 1));
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [sortedAndFilteredContainers, sortBy, sortOrder]);

  // Status counters
  const runningCount = containers.filter((c) => c.state === 'running').length;
  const stoppedCount = containers.filter((c) => c.state === 'exited' || c.state === 'dead').length;

  return (
    <Box sx={{ pb: 6 }}>
      {/* Header & Node Selector */}
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
              {t('docker.title')}
            </Typography>
            <Chip
              icon={<Boxes size={15} />}
              label={t('docker.badge')}
              size="small"
              sx={{
                bgcolor: alpha(theme.palette.primary.main, 0.12),
                color: 'primary.main',
                fontWeight: 700
              }}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t('docker.subtitle')}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 260 }}>
            <InputLabel>{t('docker.nodeSelector')}</InputLabel>
            <Select
              value={selectedHostId}
              label={t('docker.nodeSelector')}
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
            {t('docker.refresh')}
          </Button>
        </Stack>
      </Stack>

      {/* Host Offline Warning */}
      {hostInfo && !hostInfo.available && (
        <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>
          Không thể kết nối đến Docker daemon trên node này. Hãy chắc chắn Docker đang chạy hoặc socket đã được mount.
        </Alert>
      )}

      {/* KPI Cards */}
      <Grid container spacing={2.5} sx={{ mb: 3.5 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, boxShadow: theme.shadows[1] }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  {t('docker.kpi.totalContainers')}
                </Typography>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.1) }}>
                  <Boxes size={20} color={theme.palette.primary.main} />
                </Box>
              </Stack>
              <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>
                {containers.length}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Chip label={`${runningCount} ${t('docker.kpi.running')}`} size="small" color="success" sx={{ height: 20, fontSize: 11 }} />
                <Chip label={`${stoppedCount} ${t('docker.kpi.stopped')}`} size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, boxShadow: theme.shadows[1] }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  {t('docker.kpi.stacks')}
                </Typography>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(theme.palette.info.main, 0.1) }}>
                  <Layers size={20} color={theme.palette.info.main} />
                </Box>
              </Stack>
              <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>
                {stacks.length}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {t('docker.kpi.stacksDesc')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, boxShadow: theme.shadows[1] }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  {t('docker.kpi.images')}
                </Typography>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(theme.palette.secondary.main, 0.1) }}>
                  <Server size={20} color={theme.palette.secondary.main} />
                </Box>
              </Stack>
              <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>
                {images.length}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {t('docker.kpi.imagesDesc')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, boxShadow: theme.shadows[1] }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  {t('docker.kpi.volumes')}
                </Typography>
                <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(theme.palette.warning.main, 0.1) }}>
                  <HardDrive size={20} color={theme.palette.warning.main} />
                </Box>
              </Stack>
              <Typography variant="h4" sx={{ fontWeight: 800, mt: 1 }}>
                {volumes.length}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {t('docker.kpi.volumesDesc')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Main Tabs */}
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
              label={`${t('docker.tabs.containers')} (${containers.length})`}
              icon={<Boxes size={18} />}
              iconPosition="start"
              sx={{ fontWeight: 700 }}
            />
            <Tab
              value="stacks"
              label={`${t('docker.tabs.stacks')} (${stacks.length})`}
              icon={<Layers size={18} />}
              iconPosition="start"
              sx={{ fontWeight: 700 }}
            />
            <Tab
              value="images"
              label={`${t('docker.tabs.images')} (${images.length})`}
              icon={<Server size={18} />}
              iconPosition="start"
              sx={{ fontWeight: 700 }}
            />
            <Tab
              value="volumes"
              label={`${t('docker.tabs.volumes')} (${volumes.length})`}
              icon={<HardDrive size={18} />}
              iconPosition="start"
              sx={{ fontWeight: 700 }}
            />
          </Tabs>
        </Box>

        {/* ========================================== */}
        {/* Tab 1: Containers (Grouped & Flat Views)    */}
        {/* ========================================== */}
        {currentTab === 'containers' && (
          <Box sx={{ p: 2.5 }}>
            {/* Control & Sorting Toolbar */}
            <Stack
              direction={{ xs: 'column', lg: 'row' }}
              spacing={2}
              justifyContent="space-between"
              alignItems={{ xs: 'stretch', lg: 'center' }}
              sx={{ mb: 2.5 }}
            >
              {/* Search & Status Filters */}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center">
                <TextField
                  size="small"
                  placeholder={t('docker.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  sx={{ width: { xs: '100%', sm: 260 } }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search size={18} />
                      </InputAdornment>
                    )
                  }}
                />

                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant={statusFilter === 'all' ? 'contained' : 'outlined'}
                    onClick={() => setStatusFilter('all')}
                    sx={{ borderRadius: 2, textTransform: 'none' }}
                  >
                    {t('docker.filter.all')} ({containers.length})
                  </Button>
                  <Button
                    size="small"
                    variant={statusFilter === 'running' ? 'contained' : 'outlined'}
                    color="success"
                    onClick={() => setStatusFilter('running')}
                    sx={{ borderRadius: 2, textTransform: 'none' }}
                  >
                    {t('docker.filter.running')} ({runningCount})
                  </Button>
                  <Button
                    size="small"
                    variant={statusFilter === 'stopped' ? 'contained' : 'outlined'}
                    color="inherit"
                    onClick={() => setStatusFilter('stopped')}
                    sx={{ borderRadius: 2, textTransform: 'none' }}
                  >
                    {t('docker.filter.stopped')} ({stoppedCount})
                  </Button>
                </Stack>
              </Stack>

              {/* Sorting & Stack Controls */}
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                {/* View Mode Toggle */}
                <ToggleButtonGroup
                  size="small"
                  value={viewMode}
                  exclusive
                  onChange={(e, val) => val && setViewMode(val)}
                  sx={{ height: 36 }}
                >
                  <ToggleButton value="grouped">
                    <Tooltip title={t('docker.viewMode.grouped')}>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Layers size={15} />
                        <Typography variant="caption" sx={{ ml: 0.5, fontWeight: 600 }}>{t('docker.viewMode.grouped')}</Typography>
                      </Stack>
                    </Tooltip>
                  </ToggleButton>
                  <ToggleButton value="flat">
                    <Tooltip title={t('docker.viewMode.flat')}>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <ListIcon size={15} />
                        <Typography variant="caption" sx={{ ml: 0.5, fontWeight: 600 }}>{t('docker.viewMode.flat')}</Typography>
                      </Stack>
                    </Tooltip>
                  </ToggleButton>
                </ToggleButtonGroup>

                {/* Sort Selector */}
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>{t('docker.sort.label')}</InputLabel>
                  <Select
                    value={sortBy}
                    label={t('docker.sort.label')}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <MenuItem value="name">{t('docker.sort.name')}</MenuItem>
                    <MenuItem value="cpu">{t('docker.sort.cpu')}</MenuItem>
                    <MenuItem value="memory">{t('docker.sort.memory')}</MenuItem>
                    <MenuItem value="status">{t('docker.sort.status')}</MenuItem>
                  </Select>
                </FormControl>

                {/* Sort Order Direction Toggle */}
                <IconButton
                  size="small"
                  onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                  sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}
                >
                  {sortOrder === 'asc' ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
                </IconButton>

                {/* Expand / Collapse All in Grouped Mode */}
                {viewMode === 'grouped' && (
                  <Stack direction="row" spacing={0.5}>
                    <Button size="small" variant="text" onClick={handleExpandAllStacks} sx={{ textTransform: 'none', fontSize: 12 }}>
                      {t('docker.expandAll')}
                    </Button>
                    <Button size="small" variant="text" onClick={handleCollapseAllStacks} sx={{ textTransform: 'none', fontSize: 12 }}>
                      {t('docker.collapseAll')}
                    </Button>
                  </Stack>
                )}
              </Stack>
            </Stack>

            {/* Content: Grouped by Stack View */}
            {viewMode === 'grouped' ? (
              <Stack spacing={2.5}>
                {groupedStacks.map((st) => {
                  const isCollapsed = collapsedStacks.has(st.name);
                  const isAllRunning = st.runningCount === st.totalCount && st.totalCount > 0;

                  return (
                    <Card
                      key={st.name}
                      variant="outlined"
                      sx={{
                        borderRadius: 2.5,
                        borderColor: alpha(theme.palette.divider, 0.8),
                        overflow: 'hidden'
                      }}
                    >
                      {/* Stack Header */}
                      <Box
                        onClick={() => toggleStackCollapse(st.name)}
                        sx={{
                          px: 2.5,
                          py: 1.75,
                          bgcolor: alpha(theme.palette.primary.main, 0.04),
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08) }
                        }}
                      >
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <IconButton size="small" sx={{ p: 0.5 }}>
                            {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                          </IconButton>
                          <Box sx={{ p: 0.75, borderRadius: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.1) }}>
                            <Layers size={18} color={theme.palette.primary.main} />
                          </Box>
                          <Box>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                {st.isStandalone ? t('docker.standalone') : st.name}
                              </Typography>
                              <Chip
                                label={`${st.runningCount}/${st.totalCount} Running`}
                                size="small"
                                color={isAllRunning ? 'success' : st.runningCount > 0 ? 'warning' : 'default'}
                                sx={{ height: 20, fontSize: 11, fontWeight: 700 }}
                              />
                            </Stack>
                          </Box>
                        </Stack>

                        {/* Stack Aggregate Telemetry & Actions */}
                        <Stack direction="row" spacing={2} alignItems="center">
                          {/* Aggregate CPU */}
                          <Tooltip title="Tổng CPU sử dụng bởi toàn bộ stack">
                            <Chip
                              icon={<Cpu size={14} />}
                              label={`${st.totalCpuPercent.toFixed(1)}% CPU`}
                              size="small"
                              variant="outlined"
                              sx={{
                                height: 24,
                                fontSize: 11,
                                fontWeight: 700,
                                borderColor: alpha(theme.palette.primary.main, 0.3)
                              }}
                            />
                          </Tooltip>

                          {/* Aggregate Memory */}
                          <Tooltip title="Tổng RAM sử dụng bởi toàn bộ stack">
                            <Chip
                              icon={<HardDrive size={14} />}
                              label={`${formatBytes(st.totalMemUsageBytes)} RAM`}
                              size="small"
                              variant="outlined"
                              sx={{
                                height: 24,
                                fontSize: 11,
                                fontWeight: 700,
                                borderColor: alpha(theme.palette.info.main, 0.3)
                              }}
                            />
                          </Tooltip>

                          {!st.isStandalone && (
                            <Tooltip title="Khởi động lại toàn bộ Stack">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={(e) => handleStackAction(e, st, 'restart')}
                              >
                                <RotateCw size={16} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </Box>

                      {/* Stack Containers Table */}
                      <Collapse in={!isCollapsed}>
                        <Divider />
                        <Table size="small">
                          <TableHead sx={{ bgcolor: 'background.paper' }}>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 700, pl: 3 }}>{t('docker.table.container')}</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>{t('docker.table.status')}</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>{t('docker.table.cpu')}</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>{t('docker.table.memory')}</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>{t('docker.table.ports')}</TableCell>
                              <TableCell sx={{ fontWeight: 700, textAlign: 'right', pr: 3 }}>{t('docker.table.actions')}</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {st.containers.map((c) => (
                              <ContainerTableRow
                                key={c.id}
                                container={c}
                                actionLoading={actionLoading}
                                onAction={handleContainerAction}
                                onRowClick={() => handleOpenContainerDetail(c, 'overview')}
                                onOpenLogs={() => handleOpenContainerDetail(c, 'logs')}
                                onOpenTerminal={() => handleOpenContainerDetail(c, 'terminal')}
                              />
                            ))}
                          </TableBody>
                        </Table>
                      </Collapse>
                    </Card>
                  );
                })}
              </Stack>
            ) : (
              /* Flat Table View */
              <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
                <Table size="medium">
                  <TableHead sx={{ bgcolor: alpha(theme.palette.primary.main, 0.03) }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>{t('docker.table.container')}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{t('docker.table.status')}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{t('docker.table.cpu')}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{t('docker.table.memory')}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{t('docker.table.ports')}</TableCell>
                      <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>{t('docker.table.actions')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortedAndFilteredContainers.map((c) => (
                      <ContainerTableRow
                        key={c.id}
                        container={c}
                        actionLoading={actionLoading}
                        onAction={handleContainerAction}
                        onRowClick={() => handleOpenContainerDetail(c, 'overview')}
                        onOpenLogs={() => handleOpenContainerDetail(c, 'logs')}
                        onOpenTerminal={() => handleOpenContainerDetail(c, 'terminal')}
                      />
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {/* Tab 2: Compose Stacks Management */}
        {currentTab === 'stacks' && (
          <Box sx={{ p: 2.5 }}>
            <Grid container spacing={2.5}>
              {stacks.map((st) => (
                <Grid item xs={12} md={6} key={st.name}>
                  <Card variant="outlined" sx={{ borderRadius: 2.5, p: 2.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.1) }}>
                          <Layers size={22} color={theme.palette.primary.main} />
                        </Box>
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            {st.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {st.runningCount} / {st.totalCount} containers đang chạy
                          </Typography>
                        </Box>
                      </Stack>

                      <Stack direction="row" spacing={1}>
                        <Chip
                          icon={<Cpu size={14} />}
                          label={`${(st.totalCpuPercent || 0).toFixed(1)}%`}
                          size="small"
                          sx={{ fontWeight: 700 }}
                        />
                        <Chip
                          icon={<HardDrive size={14} />}
                          label={formatBytes(st.totalMemUsageBytes || 0)}
                          size="small"
                          sx={{ fontWeight: 700 }}
                        />
                      </Stack>
                    </Stack>

                    <Divider sx={{ my: 2 }} />

                    <Stack spacing={1}>
                      {st.containers.map((sc) => (
                        <Stack
                          key={sc.id}
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                          sx={{
                            p: 1,
                            borderRadius: 1.5,
                            bgcolor: 'action.hover',
                            cursor: 'pointer'
                          }}
                          onClick={() => handleOpenContainerDetail(sc, 'overview')}
                        >
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
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                              {(sc.stats?.cpuPercent || 0).toFixed(1)}% CPU | {formatBytes(sc.stats?.memUsageBytes || 0)}
                            </Typography>
                            <Chip label={sc.state} size="small" variant="outlined" sx={{ height: 20, fontSize: 10 }} />
                          </Stack>
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
                {t('docker.prune.images')}
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
                      <TableCell>{formatBytes(img.sizeBytes)}</TableCell>
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
                {t('docker.prune.volumes')}
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
      {/* Full Container Inspector & Live Logs Modal */}
      {/* ========================================== */}
      <Dialog
        open={detailModal.open}
        onClose={handleCloseDetailModal}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, minHeight: '75vh' } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                bgcolor: detailModal.container?.state === 'running' ? 'success.main' : 'text.disabled'
              }}
            />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {detailModal.container?.name}
            </Typography>
            <Chip
              label={detailModal.container?.shortId}
              size="small"
              sx={{ fontFamily: 'monospace', fontSize: 11 }}
            />
          </Stack>

          <Button size="small" variant="outlined" onClick={handleCloseDetailModal}>
            {t('docker.modal.close')}
          </Button>
        </DialogTitle>

        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
          <Tabs
            value={detailModal.activeSubTab}
            onChange={(e, val) => handleSubTabChange(val)}
            textColor="primary"
            indicatorColor="primary"
          >
            <Tab value="overview" label={t('docker.modal.overview')} icon={<Info size={16} />} iconPosition="start" sx={{ fontWeight: 700 }} />
            <Tab value="logs" label={t('docker.modal.logs')} icon={<FileText size={16} />} iconPosition="start" sx={{ fontWeight: 700 }} />
            <Tab value="terminal" label={t('docker.modal.terminal')} icon={<Terminal size={16} />} iconPosition="start" sx={{ fontWeight: 700 }} />
          </Tabs>
        </Box>

        <DialogContent sx={{ p: 3 }}>
          {/* SubTab 1: Overview & Details */}
          {detailModal.activeSubTab === 'overview' && (
            <Stack spacing={3}>
              {/* Telemetry Gauge Cards */}
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Card variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                        PROCESSOR (CPU USAGE)
                      </Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'primary.main' }}>
                        {(detailModal.container?.stats?.cpuPercent || 0).toFixed(2)}%
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(100, detailModal.container?.stats?.cpuPercent || 0)}
                      sx={{ height: 8, borderRadius: 4, mt: 1.5 }}
                    />
                  </Card>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Card variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                        MEMORY (RAM USAGE)
                      </Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'info.main' }}>
                        {formatBytes(detailModal.container?.stats?.memUsageBytes || 0)} / {formatBytes(detailModal.container?.stats?.memLimitBytes || 0)} ({(detailModal.container?.stats?.memPercent || 0).toFixed(1)}%)
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      color="info"
                      value={Math.min(100, detailModal.container?.stats?.memPercent || 0)}
                      sx={{ height: 8, borderRadius: 4, mt: 1.5 }}
                    />
                  </Card>
                </Grid>
              </Grid>

              {/* Basic Info */}
              {detailModal.data ? (
                <Stack spacing={2.5}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                      {t('docker.modal.processAndNet')}
                    </Typography>
                    <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2"><strong>{t('docker.table.status')}:</strong> {detailModal.data.state?.status} (PID: {detailModal.data.state?.pid || '—'})</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2"><strong>{t('docker.modal.startedAt')}:</strong> {detailModal.data.state?.startedAt ? new Date(detailModal.data.state.startedAt).toLocaleString() : '—'}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2"><strong>Image:</strong> {detailModal.data.image}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2"><strong>IP Address:</strong> {detailModal.data.networkSettings?.ipAddress || 'Host Mode'}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2"><strong>{t('docker.modal.restartPolicy')}:</strong> {detailModal.data.restartPolicy}</Typography>
                      </Grid>
                    </Grid>
                  </Box>

                  <Divider />

                  {/* Mounts */}
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                      {t('docker.modal.mounts')} ({detailModal.data.mounts?.length || 0})
                    </Typography>
                    <Stack spacing={0.75} sx={{ mt: 1 }}>
                      {detailModal.data.mounts?.map((m, idx) => (
                        <Box key={idx} sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5, fontFamily: 'monospace', fontSize: 12 }}>
                          {m.source} ➔ {m.destination} ({m.mode})
                        </Box>
                      ))}
                    </Stack>
                  </Box>

                  <Divider />

                  {/* Envs */}
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                      {t('docker.modal.envVars')}
                    </Typography>
                    <Box sx={{ maxHeight: 200, overflowY: 'auto', mt: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      {detailModal.data.env?.map((e, idx) => (
                        <Typography key={idx} variant="caption" sx={{ display: 'block', fontFamily: 'monospace', py: 0.25 }}>
                          <strong style={{ color: theme.palette.primary.main }}>{e.key}=</strong>{e.value}
                        </Typography>
                      ))}
                    </Box>
                  </Box>
                </Stack>
              ) : (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <CircularProgress size={28} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Đang tải chi tiết cấu hình container...
                  </Typography>
                </Box>
              )}
            </Stack>
          )}

          {/* SubTab 2: Live Logs Viewer */}
          {detailModal.activeSubTab === 'logs' && (
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    label={modalLogs.isStreaming ? t('docker.modal.streaming') : t('docker.modal.stoppedStreaming')}
                    size="small"
                    color={modalLogs.isStreaming ? 'success' : 'default'}
                    sx={{ fontWeight: 700 }}
                  />
                </Stack>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Download size={14} />}
                  onClick={() => {
                    const blob = new Blob([modalLogs.logs], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${detailModal.container?.name || 'docker'}-logs.log`;
                    a.click();
                  }}
                >
                  {t('docker.modal.downloadLogs')}
                </Button>
              </Stack>

              <Box
                sx={{
                  p: 2,
                  bgcolor: '#030712',
                  borderRadius: 2.5,
                  fontFamily: 'Consolas, Monaco, monospace',
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: '#4ADE80',
                  height: '52vh',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all'
                }}
              >
                {modalLogs.logs || 'Đang kết nối luồng log container...'}
                <div ref={logsEndRef} />
              </Box>
            </Box>
          )}

          {/* SubTab 3: Web Console / Terminal */}
          {detailModal.activeSubTab === 'terminal' && (
            <Box>
              <Box
                sx={{
                  p: 2,
                  bgcolor: '#010409',
                  borderRadius: 2.5,
                  fontFamily: 'Consolas, Monaco, monospace',
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: '#38BDF8',
                  height: '46vh',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  mb: 1.5
                }}
              >
                {modalTerm.history}
                <div ref={termEndRef} />
              </Box>

              <form onSubmit={handleSendTermCommand}>
                <Stack direction="row" spacing={1}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder={t('docker.modal.termPlaceholder')}
                    value={modalTerm.input}
                    onChange={(e) => setModalTerm((prev) => ({ ...prev, input: e.target.value }))}
                    sx={{
                      bgcolor: 'action.hover',
                      borderRadius: 1.5,
                      '& input': { fontFamily: 'monospace' }
                    }}
                  />
                  <Button type="submit" variant="contained" color="primary" sx={{ px: 3 }}>
                    {t('docker.modal.send')}
                  </Button>
                </Stack>
              </form>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Toast Notification */}
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

// Reusable Container Table Row Component
function ContainerTableRow({
  container: c,
  actionLoading,
  onAction,
  onRowClick,
  onOpenLogs,
  onOpenTerminal
}) {
  const isRunning = c.state === 'running';
  const isPaused = c.state === 'paused';
  const currentAction = actionLoading[c.id];

  const cpuPercent = c.stats?.cpuPercent || 0;
  const memUsage = c.stats?.memUsageBytes || 0;
  const memPercent = c.stats?.memPercent || 0;

  return (
    <TableRow
      hover
      onClick={onRowClick}
      sx={{
        cursor: 'pointer',
        '&:last-child td, &:last-child th': { border: 0 }
      }}
    >
      {/* Name & ShortId */}
      <TableCell sx={{ pl: 3 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              bgcolor: isRunning ? 'success.main' : isPaused ? 'warning.main' : 'text.disabled'
            }}
          />
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {c.name}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                {c.shortId}
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: 11 }} noWrap>
                • {c.image}
              </Typography>
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

      {/* CPU Usage */}
      <TableCell sx={{ width: 140 }}>
        {isRunning ? (
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
              {cpuPercent.toFixed(1)}%
            </Typography>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, cpuPercent)}
              sx={{ height: 5, borderRadius: 2.5, mt: 0.5 }}
            />
          </Box>
        ) : (
          <Typography variant="caption" color="text.disabled">—</Typography>
        )}
      </TableCell>

      {/* Memory Usage */}
      <TableCell sx={{ width: 160 }}>
        {isRunning ? (
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
              {formatBytes(memUsage)} ({memPercent.toFixed(1)}%)
            </Typography>
            <LinearProgress
              variant="determinate"
              color="info"
              value={Math.min(100, memPercent)}
              sx={{ height: 5, borderRadius: 2.5, mt: 0.5 }}
            />
          </Box>
        ) : (
          <Typography variant="caption" color="text.disabled">—</Typography>
        )}
      </TableCell>

      {/* Ports */}
      <TableCell>
        {c.ports?.length ? (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {c.ports.slice(0, 2).map((p, idx) => (
              <Chip
                key={idx}
                label={p.publicPort ? `${p.publicPort}:${p.privatePort}` : `${p.privatePort}/${p.type}`}
                size="small"
                sx={{ height: 20, fontSize: 10, fontFamily: 'monospace' }}
              />
            ))}
            {c.ports.length > 2 && (
              <Chip label={`+${c.ports.length - 2}`} size="small" sx={{ height: 20, fontSize: 10 }} />
            )}
          </Stack>
        ) : (
          <Typography variant="caption" color="text.disabled">—</Typography>
        )}
      </TableCell>

      {/* Actions */}
      <TableCell align="right" sx={{ pr: 3 }}>
        <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
          {isRunning ? (
            <>
              <Tooltip title="Restart Container">
                <IconButton
                  size="small"
                  color="primary"
                  disabled={Boolean(currentAction)}
                  onClick={(e) => onAction(e, c.id, 'restart', c.name)}
                >
                  <RotateCw size={15} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Stop Container">
                <IconButton
                  size="small"
                  color="warning"
                  disabled={Boolean(currentAction)}
                  onClick={(e) => onAction(e, c.id, 'stop', c.name)}
                >
                  <Square size={15} />
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <Tooltip title="Start Container">
              <IconButton
                size="small"
                color="success"
                disabled={Boolean(currentAction)}
                onClick={(e) => onAction(e, c.id, 'start', c.name)}
              >
                <Play size={15} />
              </IconButton>
            </Tooltip>
          )}

          <Tooltip title="Live Logs">
            <IconButton
              size="small"
              color="info"
              onClick={(e) => {
                e.stopPropagation();
                onOpenLogs();
              }}
            >
              <FileText size={15} />
            </IconButton>
          </Tooltip>

          {isRunning && (
            <Tooltip title="Web Console / Terminal">
              <IconButton
                size="small"
                color="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTerminal();
                }}
              >
                <Terminal size={15} />
              </IconButton>
            </Tooltip>
          )}

          {!isRunning && (
            <Tooltip title="Xoá Container">
              <IconButton
                size="small"
                color="error"
                disabled={Boolean(currentAction)}
                onClick={(e) => {
                  if (window.confirm(`Xoá container [${c.name}] vĩnh viễn?`)) {
                    onAction(e, c.id, 'remove', c.name);
                  }
                }}
              >
                <Trash2 size={15} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </TableCell>
    </TableRow>
  );
}
