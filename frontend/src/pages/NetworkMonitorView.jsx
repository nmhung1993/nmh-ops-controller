import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Menu,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  FormControlLabel,
  Checkbox,
  Switch,
  Chip,
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
  History,
  Download,
  FileSpreadsheet,
  FileCode,
  TrendingUp,
  AlertOctagon,
  Pin,
  Shield,
  Cpu,
  HardDrive,
  Gauge,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Sliders,
  SlidersHorizontal,
  ArrowUpDown,
  Users,
  Router as RouterIcon
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../utils/api';
import Label from '../components/common/Label';
import ConfirmDialog from '../components/common/ConfirmDialog';
import Chart from '../components/chart/Chart';
import NetworkDeviceDialog from '../components/network/NetworkDeviceDialog';
import OpenWrtSection from '../components/network/OpenWrtSection';
import TPLinkDecoSection from '../components/network/TPLinkDecoSection';
import ZTESection from '../components/network/ZTESection';

const PING_TIME_RANGES = [
  { value: '1h', labelVi: '1 giờ', labelEn: '1 hour' },
  { value: '8h', labelVi: '8 tiếng', labelEn: '8 hours' },
  { value: '24h', labelVi: '1 ngày', labelEn: '24 hours' },
  { value: '7d', labelVi: '1 tuần', labelEn: '7 days' }
];

export default function NetworkMonitorView() {
  const theme = useTheme();
  const { lang, t } = useLanguage();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  const [currentTab, setCurrentTab] = useState(0);
  const [tagFilter, setTagFilter] = useState('all');
  const [targets, setTargets] = useState([]);
  const [summary, setSummary] = useState({ total: 0, online: 0, degraded: 0, offline: 0, paused: 0 });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Metrics chart state
  const [chartRange, setChartRange] = useState('1h');
  const [chartTargetId, setChartTargetId] = useState('all');
  const [chartMetrics, setChartMetrics] = useState([]);
  const [loadingChart, setLoadingChart] = useState(false);

  // Export menu state
  const [exportAnchorEl, setExportAnchorEl] = useState(null);

  // Scanner state
  const [scanSubnet, setScanSubnet] = useState('192.168.1.0/24');
  const [scanState, setScanState] = useState({ isScanning: false, current: 0, total: 254, results: [] });
  const [scanHistoryList, setScanHistoryList] = useState([]);
  const [customNames, setCustomNames] = useState({});
  const [editNameDialog, setEditNameDialog] = useState({ open: false, ip: '', currentName: '', newName: '' });

  // Managed Network Devices (CRUD)
  const [managedDevices, setManagedDevices] = useState([]);
  const [selectedGatewayId, setSelectedGatewayId] = useState('dev_mikrotik_1');
  const [selectedRouterDeviceId, setSelectedRouterDeviceId] = useState('dev_xiaomi_1');
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [deviceDefaultRole, setDeviceDefaultRole] = useState('gateway');
  const [confirmDeleteDeviceId, setConfirmDeleteDeviceId] = useState(null);

  // Router Type Selector ('mikrotik' | 'openwrt' | 'xiaomi' | 'tplink_deco' | 'gecoos')
  const [selectedRouterType, setSelectedRouterType] = useState('mikrotik');

  // OpenWrt state
  const [openwrtStatus, setOpenwrtStatus] = useState(null);
  const [loadingOpenwrt, setLoadingOpenwrt] = useState(false);

  // Deco state
  const [decoStatus, setDecoStatus] = useState(null);
  const [loadingDeco, setLoadingDeco] = useState(false);

  // ZTE state
  const [zteStatus, setZteStatus] = useState(null);
  const [loadingZte, setLoadingZte] = useState(false);

  // MikroTik state
  const [mikrotikStatus, setMikrotikStatus] = useState(null);
  const [loadingMikrotik, setLoadingMikrotik] = useState(false);
  const [mikrotikConfigOpen, setMikrotikConfigOpen] = useState(false);
  const [mikrotikHost, setMikrotikHost] = useState('192.168.1.1');
  const [mikrotikPort, setMikrotikPort] = useState(8728);
  const [mikrotikUsername, setMikrotikUsername] = useState('admin');
  const [mikrotikPassword, setMikrotikPassword] = useState('');
  const [mikrotikUseHttps, setMikrotikUseHttps] = useState(false);
  const [mikrotikPppoeInterface, setMikrotikPppoeInterface] = useState('pppoe-out1');
  const [confirmReconnectPppoeOpen, setConfirmReconnectPppoeOpen] = useState(false);
  const [confirmMikrotikRebootOpen, setConfirmMikrotikRebootOpen] = useState(false);
  const [showPppoeUser, setShowPppoeUser] = useState(false);
  const [leaseSearch, setLeaseSearch] = useState('');

  const filteredLeases = useMemo(() => {
    const list = mikrotikStatus?.dhcpLeases || [];
    if (!leaseSearch.trim()) return list;
    const q = leaseSearch.trim().toLowerCase();
    return list.filter(l =>
      (l.ip && l.ip.toLowerCase().includes(q)) ||
      (l.hostname && l.hostname.toLowerCase().includes(q)) ||
      (l.mac && l.mac.toLowerCase().includes(q)) ||
      (l.comment && l.comment.toLowerCase().includes(q))
    );
  }, [mikrotikStatus?.dhcpLeases, leaseSearch]);
  const [mikrotikSubTab, setMikrotikSubTab] = useState('leases'); // 'leases' | 'queues' | 'nat'
  const [mikrotikQueues, setMikrotikQueues] = useState([]);
  const [loadingQueues, setLoadingQueues] = useState(false);
  const [queueDialogOpen, setQueueDialogOpen] = useState(false);
  const [queueForm, setQueueForm] = useState({ id: '', name: '', target: '', uploadLimit: '10M', downloadLimit: '20M', comment: '' });
  const [mikrotikNatRules, setMikrotikNatRules] = useState([]);
  const [loadingNat, setLoadingNat] = useState(false);
  const [wolLoadingMac, setWolLoadingMac] = useState(null);
  const [confirmDeleteQueueId, setConfirmDeleteQueueId] = useState(null);

  // NAT Templates & Custom Rule Dialogs
  const [natTemplates, setNatTemplates] = useState([]);
  const [natTemplateDialogOpen, setNatTemplateDialogOpen] = useState(false);
  const [natFormDialogOpen, setNatFormDialogOpen] = useState(false);
  const [natForm, setNatForm] = useState({
    chain: 'dstnat',
    action: 'dst-nat',
    protocol: 'tcp',
    dstPort: '',
    toAddresses: '',
    toPorts: '',
    inInterface: '',
    outInterface: '',
    comment: ''
  });
  const [confirmDeleteNatId, setConfirmDeleteNatId] = useState(null);

  // Router state (Xiaomi / Gecoos AP)
  const [selectedRouterHost, setSelectedRouterHost] = useState('192.168.1.2');
  const [routerStatus, setRouterStatus] = useState(null);
  const [loadingRouter, setLoadingRouter] = useState(false);
  const [routerConfigOpen, setRouterConfigOpen] = useState(false);
  const [routerHost, setRouterHost] = useState('192.168.1.2');
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
  const [confirmRebootTarget, setConfirmRebootTarget] = useState(null);
  const [confirmWifiRestartTarget, setConfirmWifiRestartTarget] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);

  // Auto-dismiss action message
  useEffect(() => {
    if (actionMessage) {
      const timer = setTimeout(() => setActionMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionMessage]);

  useEffect(() => {
    if (!isSuperAdmin && currentTab !== 0) {
      setCurrentTab(0);
    }
  }, [isSuperAdmin, currentTab]);

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

  // Fetch chart metrics
  const loadChartMetrics = useCallback(async () => {
    setLoadingChart(true);
    try {
      const data = await apiRequest(`/api/v1/network/metrics?range=${chartRange}&targetId=${chartTargetId}`);
      setChartMetrics(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load network metrics:', err);
    } finally {
      setLoadingChart(false);
    }
  }, [chartRange, chartTargetId]);

  // Fetch scan progress, history and custom names
  const loadScanState = useCallback(async () => {
    try {
      const [state, history, names] = await Promise.all([
        apiRequest('/api/v1/network/scan'),
        apiRequest('/api/v1/network/scan/history'),
        apiRequest('/api/v1/network/custom-names')
      ]);
      setScanState(state || { isScanning: false, current: 0, total: 254, results: [] });
      setScanHistoryList(Array.isArray(history) ? history : []);
      setCustomNames(names || {});
    } catch (err) {}
  }, []);

  const handleTogglePinHistory = async (sessionId) => {
    try {
      const res = await apiRequest(`/api/v1/network/scan/history/${sessionId}/pin`, { method: 'POST' });
      if (res && res.history) {
        setScanHistoryList(res.history);
      } else {
        loadScanState();
      }
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  };

  const handleDeleteHistorySession = async (sessionId) => {
    try {
      const res = await apiRequest(`/api/v1/network/scan/history/${sessionId}`, { method: 'DELETE' });
      if (res && res.history) {
        setScanHistoryList(res.history);
      } else {
        loadScanState();
      }
    } catch (err) {
      console.error('Failed to delete history session:', err);
    }
  };

  const handleOpenEditIpName = (ip, currentHostname) => {
    setEditNameDialog({
      open: true,
      ip,
      currentName: currentHostname || ip,
      newName: customNames[ip] || (currentHostname && currentHostname !== ip ? currentHostname : '')
    });
  };

  const handleSaveCustomName = async (e) => {
    if (e) e.preventDefault();
    try {
      await apiRequest('/api/v1/network/custom-names', {
        method: 'POST',
        body: JSON.stringify({ ip: editNameDialog.ip, name: editNameDialog.newName.trim() })
      });
      setEditNameDialog({ open: false, ip: '', currentName: '', newName: '' });
      loadScanState();
    } catch (err) {
      console.error('Failed to save custom name:', err);
    }
  };

  const handleClearCustomName = async () => {
    try {
      await apiRequest('/api/v1/network/custom-names', {
        method: 'POST',
        body: JSON.stringify({ ip: editNameDialog.ip, name: '' })
      });
      setEditNameDialog({ open: false, ip: '', currentName: '', newName: '' });
      loadScanState();
    } catch (err) {
      console.error('Failed to clear custom name:', err);
    }
  };

  // Fetch MikroTik status
  const loadMikrotikStatus = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingMikrotik(true);
    try {
      const data = await apiRequest('/api/v1/network/mikrotik/status');
      setMikrotikStatus(data);
    } catch (err) {
      console.error('Failed to load MikroTik status:', err);
    } finally {
      if (!isSilent) setLoadingMikrotik(false);
    }
  }, []);

  // Fetch MikroTik Simple Queues
  const loadMikrotikQueues = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingQueues(true);
    try {
      const res = await apiRequest('/api/v1/network/mikrotik/queues');
      setMikrotikQueues(Array.isArray(res?.queues) ? res.queues : []);
    } catch (err) {
      console.error('Failed to load MikroTik queues:', err);
    } finally {
      if (!isSilent) setLoadingQueues(false);
    }
  }, []);

  // Fetch MikroTik NAT Rules
  const loadMikrotikNat = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingNat(true);
    try {
      const res = await apiRequest('/api/v1/network/mikrotik/nat');
      setMikrotikNatRules(Array.isArray(res?.rules) ? res.rules : []);
    } catch (err) {
      console.error('Failed to load MikroTik NAT rules:', err);
    } finally {
      if (!isSilent) setLoadingNat(false);
    }
  }, []);

  // Fetch NAT Templates
  const loadNatTemplates = useCallback(async () => {
    try {
      const data = await apiRequest('/api/v1/network/mikrotik/nat/templates');
      setNatTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load NAT templates:', err);
    }
  }, []);

  const handleOpenQueueLimit = (targetIp, hostname = '') => {
    const existingQueue = mikrotikQueues.find(q => q.target === targetIp || q.target === `${targetIp}/32`);
    const cleanName = (hostname || targetIp).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    if (existingQueue) {
      const parts = (existingQueue.maxLimit || '10M/20M').split('/');
      setQueueForm({
        id: existingQueue.id,
        name: existingQueue.name,
        target: targetIp,
        uploadLimit: parts[0] || '10M',
        downloadLimit: parts[1] || '20M',
        comment: existingQueue.comment || `Giới hạn tốc độ ${hostname || targetIp}`
      });
    } else {
      setQueueForm({
        id: '',
        name: `limit_${cleanName}`,
        target: targetIp,
        uploadLimit: '10M',
        downloadLimit: '20M',
        comment: `Giới hạn tốc độ ${hostname || targetIp}`
      });
    }
    setQueueDialogOpen(true);
  };

  const handleSaveQueue = async (e) => {
    if (e) e.preventDefault();
    try {
      const maxLimit = `${queueForm.uploadLimit || '10M'}/${queueForm.downloadLimit || '20M'}`;
      const res = await apiRequest('/api/v1/network/mikrotik/queues', {
        method: 'POST',
        body: JSON.stringify({
          name: queueForm.name.trim(),
          target: queueForm.target.trim(),
          maxLimit,
          comment: queueForm.comment.trim()
        })
      });
      setActionMessage({ type: 'success', text: res.message || 'Đã áp dụng giới hạn băng thông thành công!' });
      setQueueDialogOpen(false);
      loadMikrotikQueues();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi đặt giới hạn băng thông' });
    }
  };

  const handleDeleteQueue = async (id) => {
    try {
      const res = await apiRequest(`/api/v1/network/mikrotik/queues/${id}`, { method: 'DELETE' });
      setActionMessage({ type: 'success', text: res.message || 'Đã xóa quy tắc giới hạn băng thông!' });
      setConfirmDeleteQueueId(null);
      loadMikrotikQueues();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi xóa quy tắc' });
    }
  };

  const handleToggleNat = async (id, currentDisabled) => {
    try {
      const res = await apiRequest('/api/v1/network/mikrotik/nat/toggle', {
        method: 'POST',
        body: JSON.stringify({ id, disabled: !currentDisabled })
      });
      setActionMessage({ type: 'success', text: res.message || 'Đã cập nhật quy tắc NAT!' });
      loadMikrotikNat(true);
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi cập nhật NAT' });
    }
  };

  const handleOpenNatTemplates = () => {
    loadNatTemplates();
    setNatTemplateDialogOpen(true);
  };

  const handleApplyNatTemplate = (tpl, targetIp = '192.168.1.100') => {
    setNatForm({
      chain: tpl.chain || 'dstnat',
      action: tpl.action || 'dst-nat',
      protocol: tpl.protocol || 'tcp',
      dstPort: tpl.dstPort || '',
      toAddresses: tpl.needsTargetIp ? targetIp : '',
      toPorts: tpl.toPorts || '',
      inInterface: tpl.inInterface || '',
      outInterface: tpl.outInterface || '',
      comment: tpl.comment || tpl.title
    });
    setNatTemplateDialogOpen(false);
    setNatFormDialogOpen(true);
  };

  const handleSaveNatRule = async (e) => {
    if (e) e.preventDefault();
    try {
      const res = await apiRequest('/api/v1/network/mikrotik/nat', {
        method: 'POST',
        body: JSON.stringify(natForm)
      });
      setActionMessage({ type: 'success', text: res.message || 'Đã thêm quy tắc NAT thành công!' });
      setNatFormDialogOpen(false);
      loadMikrotikNat(false);
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi lưu quy tắc NAT' });
    }
  };

  const handleDeleteNatRule = async (id) => {
    try {
      const res = await apiRequest(`/api/v1/network/mikrotik/nat/${id}`, { method: 'DELETE' });
      setActionMessage({ type: 'success', text: res.message || 'Đã xóa quy tắc NAT!' });
      setConfirmDeleteNatId(null);
      loadMikrotikNat(false);
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi xóa NAT rule' });
    }
  };

  const handleWakeOnLan = async (mac, hostname) => {
    setWolLoadingMac(mac);
    try {
      const res = await apiRequest('/api/v1/network/wol', {
        method: 'POST',
        body: JSON.stringify({ mac, interfaceName: 'bridge' })
      });
      setActionMessage({ type: 'success', text: res.message || `Đã gửi gói tin đánh thức WoL tới ${hostname || mac}!` });
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi gửi gói tin WoL' });
    } finally {
      setWolLoadingMac(null);
    }
  };

  const handleSendWol = handleWakeOnLan;
  const handleOpenAddQueue = handleOpenQueueLimit;
  const handleOpenAddNat = (targetIp = '', hostname = '') => {
    setNatForm({
      id: '',
      chain: 'dstnat',
      action: 'dst-nat',
      protocol: 'tcp',
      dstPort: '80',
      toAddresses: targetIp || '',
      toPorts: '80',
      outInterface: '',
      comment: hostname ? `Port forward ${hostname}` : `Port forward ${targetIp}`
    });
    setNatFormDialogOpen(true);
  };

  // Fetch router status (supports Xiaomi and Gecoos)
  const loadRouterStatus = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingRouter(true);
    try {
      const data = await apiRequest(`/api/v1/network/xiaomi/status?host=${selectedRouterHost}`);
      setRouterStatus(data);
    } catch (err) {
      console.error('Failed to load router status:', err);
    } finally {
      if (!isSilent) setLoadingRouter(false);
    }
  }, [selectedRouterHost]);

  // Load Managed Devices
  const loadManagedDevices = useCallback(async () => {
    try {
      const data = await apiRequest('/api/v1/network/devices');
      if (Array.isArray(data)) {
        setManagedDevices(data);
      }
    } catch (e) {
      console.error('Failed to load devices:', e);
    }
  }, []);

  const managedGateways = useMemo(() => {
    return managedDevices.filter(d => d.role === 'gateway');
  }, [managedDevices]);

  const managedRouterMeshes = useMemo(() => {
    return managedDevices.filter(d => d.role === 'router_mesh');
  }, [managedDevices]);

  const currentGatewayDevice = useMemo(() => {
    return managedGateways.find(g => g.id === selectedGatewayId) || managedGateways[0] || null;
  }, [managedGateways, selectedGatewayId]);

  const currentRouterMeshDevice = useMemo(() => {
    return managedRouterMeshes.find(r => r.id === selectedRouterDeviceId) || managedRouterMeshes[0] || null;
  }, [managedRouterMeshes, selectedRouterDeviceId]);

  const activeGatewayType = currentGatewayDevice?.type || (managedGateways[0]?.type || 'mikrotik');
  const activeRouterMeshType = currentRouterMeshDevice?.type || (managedRouterMeshes[0]?.type || 'xiaomi');

  useEffect(() => {
    if (managedGateways.length > 0) {
      if (!selectedGatewayId || !managedGateways.some(g => g.id === selectedGatewayId)) {
        setSelectedGatewayId(managedGateways[0].id);
      }
    } else {
      setSelectedGatewayId('');
    }
  }, [managedGateways, selectedGatewayId]);

  useEffect(() => {
    if (managedRouterMeshes.length > 0) {
      if (!selectedRouterDeviceId || !managedRouterMeshes.some(r => r.id === selectedRouterDeviceId)) {
        setSelectedRouterDeviceId(managedRouterMeshes[0].id);
        setSelectedRouterHost(managedRouterMeshes[0].host);
      }
    } else {
      setSelectedRouterDeviceId('');
    }
  }, [managedRouterMeshes, selectedRouterDeviceId]);

  useEffect(() => {
    if (currentGatewayDevice?.host) {
      setMikrotikHost(currentGatewayDevice.host);
    }
  }, [currentGatewayDevice?.host]);

  useEffect(() => {
    if (currentRouterMeshDevice?.host) {
      setSelectedRouterHost(currentRouterMeshDevice.host);
    }
  }, [currentRouterMeshDevice?.host]);

  // Load OpenWrt status
  const loadOpenwrtStatus = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingOpenwrt(true);
    try {
      const targetId = currentGatewayDevice?.id || 'dev_openwrt_1';
      const data = await apiRequest(`/api/v1/network/devices/${targetId}/status`);
      setOpenwrtStatus(data);
    } catch (err) {
      console.error('Failed to load OpenWrt status:', err);
    } finally {
      if (!isSilent) setLoadingOpenwrt(false);
    }
  }, [currentGatewayDevice]);

  // Load Deco status
  const loadDecoStatus = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingDeco(true);
    try {
      const targetId = currentRouterMeshDevice?.id || 'dev_deco_1';
      const data = await apiRequest(`/api/v1/network/devices/${targetId}/status`);
      setDecoStatus(data);
    } catch (err) {
      console.error('Failed to load Deco status:', err);
    } finally {
      if (!isSilent) setLoadingDeco(false);
    }
  }, [currentRouterMeshDevice]);

  // OpenWrt Quick Ops
  const handleOpenwrtRestartNetwork = async () => {
    try {
      const targetId = currentGatewayDevice?.id || 'dev_openwrt_1';
      const res = await apiRequest(`/api/v1/network/devices/${targetId}/restart-wifi`, { method: 'POST' }).catch(() => null);
      setActionMessage({ type: 'success', text: res?.message || 'Đã gửi lệnh làm mới mạng OpenWrt!' });
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi làm mới mạng OpenWrt' });
    }
  };

  const handleOpenwrtReboot = async () => {
    try {
      const targetId = currentGatewayDevice?.id || 'dev_openwrt_1';
      const res = await apiRequest(`/api/v1/network/devices/${targetId}/reboot`, { method: 'POST' });
      setActionMessage({ type: 'success', text: res?.message || 'Đã gửi lệnh khởi động lại OpenWrt!' });
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi reboot OpenWrt' });
    }
  };

  // Deco Quick Ops
  const handleDecoRestartWifi = async () => {
    try {
      const targetId = currentRouterMeshDevice?.id || 'dev_deco_1';
      const res = await apiRequest(`/api/v1/network/devices/${targetId}/restart-wifi`, { method: 'POST' });
      setActionMessage({ type: 'success', text: res?.message || 'Đã gửi lệnh làm mới Wi-Fi Deco!' });
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi restart Wi-Fi Deco' });
    }
  };

  const handleDecoReboot = async () => {
    try {
      const targetId = currentRouterMeshDevice?.id || 'dev_deco_1';
      const res = await apiRequest(`/api/v1/network/devices/${targetId}/reboot`, { method: 'POST' });
      setActionMessage({ type: 'success', text: res?.message || 'Đã gửi lệnh khởi động lại Deco!' });
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi reboot Deco' });
    }
  };

  // Load ZTE status
  const loadZteStatus = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingZte(true);
    try {
      const targetId = currentRouterMeshDevice?.id || 'dev_zte_1';
      const data = await apiRequest(`/api/v1/network/devices/${targetId}/status`);
      setZteStatus(data);
    } catch (err) {
      console.error('Failed to load ZTE status:', err);
    } finally {
      if (!isSilent) setLoadingZte(false);
    }
  }, [currentRouterMeshDevice]);

  // ZTE Quick Ops
  const handleZteRestartWifi = async () => {
    try {
      const targetId = currentRouterMeshDevice?.id || 'dev_zte_1';
      const res = await apiRequest(`/api/v1/network/devices/${targetId}/restart-wifi`, { method: 'POST' });
      setActionMessage({ type: 'success', text: res?.message || 'Đã gửi lệnh làm mới Wi-Fi EasyMesh ZTE!' });
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi restart Wi-Fi ZTE' });
    }
  };

  const handleZteReboot = async () => {
    try {
      const targetId = currentRouterMeshDevice?.id || 'dev_zte_1';
      const res = await apiRequest(`/api/v1/network/devices/${targetId}/reboot`, { method: 'POST' });
      setActionMessage({ type: 'success', text: res?.message || 'Đã gửi lệnh khởi động lại ZTE!' });
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi reboot ZTE' });
    }
  };

  // Device CRUD
  const handleOpenAddDevice = (role = 'gateway') => {
    setEditingDevice(null);
    setDeviceDefaultRole(role);
    setDeviceDialogOpen(true);
  };

  const handleOpenEditDevice = (device) => {
    setEditingDevice(device);
    setDeviceDefaultRole(device?.role || 'gateway');
    setDeviceDialogOpen(true);
  };

  const handleSaveDevice = async (deviceData) => {
    try {
      if (editingDevice) {
        await apiRequest(`/api/v1/network/devices/${editingDevice.id}`, {
          method: 'PUT',
          body: JSON.stringify(deviceData)
        });
        setActionMessage({ type: 'success', text: `Đã cập nhật cấu hình thiết bị ${deviceData.name}!` });
      } else {
        const created = await apiRequest('/api/v1/network/devices', {
          method: 'POST',
          body: JSON.stringify(deviceData)
        });
        if (created?.id) {
          if (created.role === 'gateway') setSelectedGatewayId(created.id);
          else setSelectedRouterDeviceId(created.id);
        }
        setActionMessage({ type: 'success', text: `Đã thêm thiết bị mới: ${deviceData.name}!` });
      }
      setDeviceDialogOpen(false);
      await loadManagedDevices();
      if (deviceData.role === 'gateway') {
        setMikrotikHost(deviceData.host);
        if (deviceData.type === 'mikrotik') {
          loadMikrotikStatus(false);
        } else {
          loadOpenwrtStatus(false);
        }
      } else {
        setSelectedRouterHost(deviceData.host);
        if (deviceData.type === 'tplink_deco') loadDecoStatus(false);
        else if (deviceData.type === 'zte') loadZteStatus(false);
        else loadRouterStatus(false);
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi lưu thiết bị' });
    }
  };

  const handleDeleteDevice = async (id) => {
    try {
      await apiRequest(`/api/v1/network/devices/${id}`, { method: 'DELETE' });
      setActionMessage({ type: 'success', text: 'Đã xóa thiết bị khỏi danh sách quản lý!' });
      setConfirmDeleteDeviceId(null);
      if (selectedGatewayId === id) {
        const remaining = managedGateways.filter(g => g.id !== id);
        setSelectedGatewayId(remaining[0]?.id || '');
      }
      if (selectedRouterDeviceId === id) {
        const remaining = managedRouterMeshes.filter(r => r.id !== id);
        setSelectedRouterDeviceId(remaining[0]?.id || '');
      }
      loadManagedDevices();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi xóa thiết bị' });
    }
  };

  useEffect(() => {
    loadTargets();
    loadManagedDevices();
    const interval = setInterval(loadTargets, 3000);
    return () => clearInterval(interval);
  }, [loadTargets, loadManagedDevices]);

  useEffect(() => {
    if (currentTab === 0) {
      loadChartMetrics();
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 80);
      const interval = setInterval(loadChartMetrics, 15000);
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
  }, [currentTab, loadChartMetrics]);

  useEffect(() => {
    if (currentTab === 1) {
      loadScanState();
      if (scanState.isScanning) {
        const interval = setInterval(loadScanState, 1500);
        return () => clearInterval(interval);
      }
    }
  }, [currentTab, scanState.isScanning, loadScanState]);

  // Tab 2 Gateway Polling
  useEffect(() => {
    if (currentTab === 2 && currentGatewayDevice) {
      if (activeGatewayType === 'mikrotik') {
        loadMikrotikStatus(false);
        loadMikrotikQueues(false);
        loadMikrotikNat(false);
        const interval = setInterval(() => {
          loadMikrotikStatus(true);
          if (mikrotikSubTab === 'queues') loadMikrotikQueues(true);
          else if (mikrotikSubTab === 'nat') loadMikrotikNat(true);
        }, 5000);
        return () => clearInterval(interval);
      } else if (activeGatewayType === 'openwrt' || activeGatewayType === 'immortalwrt') {
        loadOpenwrtStatus(false);
        const interval = setInterval(() => loadOpenwrtStatus(true), 5000);
        return () => clearInterval(interval);
      }
    }
  }, [currentTab, activeGatewayType, currentGatewayDevice, mikrotikSubTab, loadMikrotikStatus, loadOpenwrtStatus, loadMikrotikQueues, loadMikrotikNat]);

  // Tab 3 Router Mesh Polling
  useEffect(() => {
    if (currentTab === 3 && currentRouterMeshDevice) {
      if (activeRouterMeshType === 'tplink_deco') {
        loadDecoStatus(false);
        const interval = setInterval(() => loadDecoStatus(true), 5000);
        return () => clearInterval(interval);
      } else if (activeRouterMeshType === 'zte') {
        loadZteStatus(false);
        const interval = setInterval(() => loadZteStatus(true), 5000);
        return () => clearInterval(interval);
      } else {
        loadRouterStatus(false);
        const interval = setInterval(() => loadRouterStatus(true), 5000);
        return () => clearInterval(interval);
      }
    }
  }, [currentTab, activeRouterMeshType, currentRouterMeshDevice, selectedRouterHost, loadRouterStatus, loadDecoStatus, loadZteStatus]);

  // Preload MikroTik status, queues & NAT once on mount
  useEffect(() => {
    loadMikrotikStatus(true);
    loadMikrotikQueues(true);
    loadMikrotikNat(true);
  }, [loadMikrotikStatus, loadMikrotikQueues, loadMikrotikNat]);

  // Ping target immediately
  const handlePingNow = async (id, e) => {
    e?.stopPropagation();
    try {
      await apiRequest(`/api/v1/network/targets/${id}/ping`, { method: 'POST' });
      loadTargets();
      loadChartMetrics();
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

  // Export Data Download
  const handleExportData = (range, format) => {
    setExportAnchorEl(null);
    const url = `/api/v1/network/export?range=${range}&format=${format}`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `network_export_${range}.${format}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
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
      setActionMessage({ type: 'success', text: res.message || `Đã gửi lệnh khởi động lại ${confirmRebootTarget.name}` });
      setConfirmRebootTarget(null);
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi khởi động lại AP' });
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
      setActionMessage({ type: 'success', text: res.message || `Đã gửi lệnh khởi động lại Wi-Fi ${confirmWifiRestartTarget.name}` });
      setConfirmWifiRestartTarget(null);
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi khởi động lại Wi-Fi' });
    }
  };

  // Reconnect PPPoE Action
  const handleReconnectPppoe = async () => {
    try {
      const res = await apiRequest('/api/v1/network/mikrotik/reconnect-pppoe', {
        method: 'POST',
        body: JSON.stringify({ interfaceName: mikrotikPppoeInterface })
      });
      setActionMessage({ type: 'success', text: res.message || 'Đã gửi lệnh làm mới phiên PPPoE thành công!' });
      setConfirmReconnectPppoeOpen(false);
      setTimeout(loadMikrotikStatus, 2000);
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi làm mới PPPoE' });
    }
  };

  // Reboot MikroTik Action
  const handleRebootMikrotik = async () => {
    try {
      const res = await apiRequest('/api/v1/network/mikrotik/reboot', { method: 'POST' });
      setActionMessage({ type: 'success', text: res.message || 'Đã gửi lệnh khởi động lại MikroTik RouterOS' });
      setConfirmMikrotikRebootOpen(false);
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi khởi động lại MikroTik' });
    }
  };

  // Open & Load MikroTik Config
  const handleOpenMikrotikConfig = async () => {
    try {
      const cfg = await apiRequest('/api/v1/network/mikrotik/config');
      if (cfg) {
        if (cfg.host) setMikrotikHost(cfg.host);
        if (cfg.port) setMikrotikPort(cfg.port);
        if (cfg.username) setMikrotikUsername(cfg.username);
        if (cfg.password !== undefined) setMikrotikPassword(cfg.password);
        if (cfg.useHttps !== undefined) setMikrotikUseHttps(Boolean(cfg.useHttps));
        if (cfg.pppoeInterface) setMikrotikPppoeInterface(cfg.pppoeInterface);
      }
    } catch {}
    setMikrotikConfigOpen(true);
  };

  // Save MikroTik Config
  const handleSaveMikrotikConfig = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/api/v1/network/mikrotik/config', {
        method: 'POST',
        body: JSON.stringify({
          host: mikrotikHost,
          port: Number(mikrotikPort) || (mikrotikUseHttps ? 8729 : 8728),
          username: mikrotikUsername,
          password: mikrotikPassword,
          useHttps: mikrotikUseHttps,
          pppoeInterface: mikrotikPppoeInterface
        })
      });
      setMikrotikConfigOpen(false);
      setActionMessage({ type: 'success', text: 'Đã cập nhật cấu hình kết nối MikroTik RouterOS!' });
      loadMikrotikStatus();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi lưu cấu hình MikroTik' });
    }
  };

  // Filtered targets
  const tagsList = ['all', ...new Set(targets.map((t) => t.tag).filter(Boolean))];
  const filteredTargets = targets.filter((t) => tagFilter === 'all' || t.tag === tagFilter);

  // WAN IP & Gateway & DNS info
  const wanIp = mikrotikStatus?.wan?.ip !== '--' ? (mikrotikStatus?.wan?.ip || routerStatus?.wan?.ip || '116.109.15.114') : (routerStatus?.wan?.ip || '116.109.15.114');
  const gatewayStr = mikrotikStatus?.wan?.gateway || routerStatus?.wan?.gateway || '192.168.1.1';
  const dnsStr = mikrotikStatus?.wan?.dns || routerStatus?.wan?.dns || '8.8.8.8, 1.1.1.1';

  // Chart preparation
  const chartTimestamps = useMemo(() => {
    return chartMetrics.map((item) => {
      const d = new Date(item.timestamp);
      if (['1h', '8h'].includes(chartRange)) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
      }
      return d.toLocaleDateString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
    });
  }, [chartMetrics, chartRange]);

  const latencySeriesData = useMemo(() => {
    return chartMetrics.map((m) => (m.maxLatency !== null && m.maxLatency !== undefined ? Number(m.maxLatency) : (m.latency !== null ? Number(m.latency) : 0)));
  }, [chartMetrics]);

  const minLatencySeriesData = useMemo(() => {
    return chartMetrics.map((m) => (m.minLatency !== null && m.minLatency !== undefined ? Number(m.minLatency) : (m.latency !== null ? Number(m.latency) : 0)));
  }, [chartMetrics]);

  const spikeSeriesData = useMemo(() => {
    return chartMetrics.map((m) => (m.isSpike || (m.maxLatency && m.maxLatency > 100) || (m.latency !== null && m.latency > 100) ? Number(m.maxLatency || m.latency) : null));
  }, [chartMetrics]);

  const dropSeriesData = useMemo(() => {
    return chartMetrics.map((m) => (m.isDrop || (m.dropCount && m.dropCount > 0) || m.status === 'offline' || m.status === 'degraded' ? (m.dropCount > 0 ? m.dropCount : 1) : null));
  }, [chartMetrics]);

  const chartSeries = useMemo(() => {
    return [
      { name: 'Độ trễ Pike / Max (ms)', type: 'area', data: latencySeriesData },
      { name: 'Độ trễ Min (ms)', type: 'line', data: minLatencySeriesData },
      { name: 'Spike Packets (>100ms)', type: 'line', data: spikeSeriesData },
      { name: 'Drop Packets (Gói rớt)', type: 'column', data: dropSeriesData }
    ];
  }, [latencySeriesData, minLatencySeriesData, spikeSeriesData, dropSeriesData]);

  const totalDrops = useMemo(() => {
    return chartMetrics.reduce((sum, m) => sum + (m.dropCount || (m.isDrop || m.status === 'offline' || m.status === 'degraded' ? 1 : 0)), 0);
  }, [chartMetrics]);

  const totalSpikes = useMemo(() => {
    return chartMetrics.filter((m) => m.isSpike || (m.maxLatency && m.maxLatency > 100) || (m.latency !== null && m.latency > 100)).length;
  }, [chartMetrics]);

  const maxSpike = useMemo(() => {
    const valid = chartMetrics.map((m) => m.maxLatency ?? m.latency).filter(v => v !== null && v !== undefined && v > 0);
    return valid.length > 0 ? Math.max(...valid) : 0;
  }, [chartMetrics]);

  const avgLatency = useMemo(() => {
    const valid = chartMetrics.filter((m) => m.latency !== null && m.latency > 0).map((m) => m.latency);
    return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
  }, [chartMetrics]);

  const jitterVal = useMemo(() => {
    const valid = chartMetrics.filter((m) => m.latency !== null).map((m) => m.latency);
    if (valid.length < 2) return 0;
    let diffSum = 0;
    for (let i = 1; i < valid.length; i++) {
      diffSum += Math.abs(valid[i] - valid[i - 1]);
    }
    return Math.round(diffSum / (valid.length - 1));
  }, [chartMetrics]);

  const pingChartOptions = useMemo(() => {
    return {
      colors: [theme.palette.primary.main, theme.palette.info.main, theme.palette.warning.main, theme.palette.error.main],
      chart: {
        toolbar: { show: false },
        animations: { enabled: false }
      },
      stroke: { curve: ['smooth', 'smooth', 'straight', 'straight'], width: [2.5, 1.5, 3, 2] },
      markers: {
        size: [0, 0, 4, 5],
        colors: [theme.palette.primary.main, theme.palette.info.main, theme.palette.warning.main, theme.palette.error.main],
        strokeColors: '#fff',
        strokeWidth: 2,
        hover: { size: 7 }
      },
      fill: {
        type: ['gradient', 'solid', 'solid', 'solid'],
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.45,
          opacityTo: 0.05,
          stops: [0, 95, 100]
        }
      },
      xaxis: {
        categories: chartTimestamps,
        labels: { rotate: -30, rotateAlways: chartTimestamps.length > 15 }
      },
      yaxis: {
        min: 0,
        labels: { formatter: (v) => `${Math.round(v)} ms` }
      },
      tooltip: {
        shared: true,
        y: {
          formatter: (v) => (v !== null && v !== undefined ? `${v} ms` : '--')
        }
      }
    };
  }, [theme.palette.primary.main, theme.palette.info.main, theme.palette.warning.main, theme.palette.error.main, chartTimestamps]);

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
            Theo dõi độ trễ, packet loss theo thời gian thực và quản trị hệ thống Router / Mesh
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
          {/* Export Data Menu Button */}
          <Button
            variant="outlined"
            color="inherit"
            startIcon={<Download size={18} />}
            onClick={(e) => setExportAnchorEl(e.currentTarget)}
            sx={{ fontWeight: 700 }}
          >
            Xuất dữ liệu
          </Button>

          <Menu
            anchorEl={exportAnchorEl}
            open={Boolean(exportAnchorEl)}
            onClose={() => setExportAnchorEl(null)}
            PaperProps={{ sx: { minWidth: 200, borderRadius: 2 } }}
          >
            <Typography variant="overline" sx={{ px: 2, py: 0.5, color: 'text.secondary', fontWeight: 800, display: 'block' }}>
              DẢI THỜI GIAN XUẤT
            </Typography>
            <MenuItem onClick={() => handleExportData('1h', 'csv')}>
              <FileSpreadsheet size={16} style={{ marginRight: 8 }} /> 1 giờ qua (CSV)
            </MenuItem>
            <MenuItem onClick={() => handleExportData('8h', 'csv')}>
              <FileSpreadsheet size={16} style={{ marginRight: 8 }} /> 8 giờ qua (CSV)
            </MenuItem>
            <MenuItem onClick={() => handleExportData('24h', 'csv')}>
              <FileSpreadsheet size={16} style={{ marginRight: 8 }} /> 1 ngày / 24h (CSV)
            </MenuItem>
            <MenuItem onClick={() => handleExportData('7d', 'csv')}>
              <FileSpreadsheet size={16} style={{ marginRight: 8 }} /> 1 tuần / 7 ngày (CSV)
            </MenuItem>
            <MenuItem onClick={() => handleExportData('30d', 'csv')}>
              <FileSpreadsheet size={16} style={{ marginRight: 8 }} /> 1 tháng / 30 ngày (CSV)
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => handleExportData('24h', 'json')}>
              <FileCode size={16} style={{ marginRight: 8 }} /> Toàn bộ dữ liệu 24h (JSON)
            </MenuItem>
          </Menu>

          {isSuperAdmin && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<Plus size={18} />}
              onClick={() => handleOpenAddTarget()}
              sx={{ fontWeight: 700, boxShadow: theme.customShadows.primary }}
            >
              Thêm Target
            </Button>
          )}
        </Stack>
      </Stack>

      {/* Consolidated Network Hero Metrics Bar */}
      <Card sx={{ borderRadius: 2.5, mb: 3, p: 2, bgcolor: alpha(theme.palette.background.paper, 0.8), backdropFilter: 'blur(8px)', border: `1px solid ${theme.palette.divider}` }}>
        <Grid container spacing={2} alignItems="center">
          {/* Total Targets */}
          <Grid item xs={12} sm={6} md={3}>
            <Stack direction="row" spacing={1.75} alignItems="center">
              <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main', display: 'flex' }}>
                <Globe size={22} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.6875rem' }}>
                  Tổng số Target
                </Typography>
                <Stack direction="row" spacing={1} alignItems="baseline">
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>
                    {summary.total}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {summary.paused > 0 ? `(${summary.paused} tạm dừng)` : 'Đang ping'}
                  </Typography>
                </Stack>
              </Box>
            </Stack>
          </Grid>

          {/* Online / Stable */}
          <Grid item xs={12} sm={6} md={3}>
            <Stack direction="row" spacing={1.75} alignItems="center">
              <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: alpha(theme.palette.success.main, 0.12), color: 'success.main', display: 'flex' }}>
                <CheckCircle2 size={22} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.6875rem' }}>
                  Trực tuyến / Ổn định
                </Typography>
                <Stack direction="row" spacing={1} alignItems="baseline">
                  <Typography variant="h5" sx={{ fontWeight: 800, color: 'success.main' }}>
                    {summary.online}
                  </Typography>
                  <Chip label="Độ trễ tốt" size="small" color="success" sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />
                </Stack>
              </Box>
            </Stack>
          </Grid>

          {/* Degraded / Offline */}
          <Grid item xs={12} sm={6} md={3}>
            <Stack direction="row" spacing={1.75} alignItems="center">
              <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: alpha(theme.palette.error.main, 0.12), color: 'error.main', display: 'flex' }}>
                <AlertTriangle size={22} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.6875rem' }}>
                  Suy giảm / Mất kết nối
                </Typography>
                <Stack direction="row" spacing={1} alignItems="baseline">
                  <Typography variant="h5" sx={{ fontWeight: 800, color: summary.offline > 0 ? 'error.main' : 'text.primary' }}>
                    {summary.degraded + summary.offline}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {summary.offline} offline • {summary.degraded} trễ cao
                  </Typography>
                </Stack>
              </Box>
            </Stack>
          </Grid>

          {/* WAN IP & Gateway */}
          <Grid item xs={12} sm={6} md={3}>
            <Stack direction="row" spacing={1.75} alignItems="center">
              <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: alpha(theme.palette.info.main, 0.12), color: 'info.main', display: 'flex' }}>
                <RouterIcon size={22} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.6875rem' }}>
                  WAN & Gateway
                </Typography>
                <Typography variant="subtitle2" noWrap sx={{ fontWeight: 800, color: 'primary.main', fontFamily: 'monospace' }}>
                  {wanIp}
                </Typography>
                <Typography variant="caption" noWrap sx={{ color: 'text.secondary', display: 'block', fontSize: '0.7rem' }}>
                  GW: {gatewayStr}
                </Typography>
              </Box>
            </Stack>
          </Grid>
        </Grid>
      </Card>

      {/* Tabs Selector */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={currentTab} onChange={(_, v) => setCurrentTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab icon={<Globe size={18} />} iconPosition="start" label="Giám sát kết nối (Ping Monitor)" sx={{ fontWeight: 700 }} />
          {isSuperAdmin && <Tab icon={<Search size={18} />} iconPosition="start" label="Quét mạng LAN (Subnet Scanner)" sx={{ fontWeight: 700 }} />}
          {isSuperAdmin && <Tab icon={<Shield size={18} />} iconPosition="start" label="Gateway (Core Router)" sx={{ fontWeight: 700 }} />}
          {isSuperAdmin && <Tab icon={<Wifi size={18} />} iconPosition="start" label="Router & Wi-Fi Mesh" sx={{ fontWeight: 700 }} />}
        </Tabs>
      </Box>

      {/* Action Notification Message if any */}
      {actionMessage && (
        <Alert
          severity={typeof actionMessage === 'object' ? (actionMessage?.type || 'info') : 'success'}
          sx={{ mb: 3, borderRadius: 2 }}
          onClose={() => setActionMessage(null)}
        >
          {typeof actionMessage === 'object' ? (actionMessage?.text || '') : actionMessage}
        </Alert>
      )}

      {/* ==================================================== */}
      {/* TAB 0: PING MONITOR & PING TRENDS CHART */}
      {/* ==================================================== */}
      <Box sx={{ display: currentTab === 0 ? 'block' : 'none' }}>
        <Stack spacing={3.5}>
          {/* Biểu đồ biến động Ping & Drop Packet */}
          <Card sx={{ p: 3 }}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              alignItems={{ xs: 'flex-start', md: 'center' }}
              justifyContent="space-between"
              spacing={2}
              sx={{ mb: 2.5 }}
            >
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrendingUp size={20} color={theme.palette.primary.main} /> Biến động độ trễ & Drop Packet
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Ưu tiên cảnh báo gói tin bị Drop (Timeout) và Spike giật lag theo thời gian thực
                </Typography>
              </Box>

              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
                {/* Target Selector Dropdown */}
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <Select
                    value={chartTargetId}
                    onChange={(e) => setChartTargetId(e.target.value)}
                    sx={{ fontSize: '0.8125rem', borderRadius: 1.5 }}
                  >
                    <MenuItem value="all">Tất cả Target</MenuItem>
                    {targets.map((t) => (
                      <MenuItem key={t.id} value={t.id}>
                        {t.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {/* Range Selector Buttons */}
                <Stack direction="row" spacing={0.5}>
                  {PING_TIME_RANGES.map((r) => {
                    const active = chartRange === r.value;
                    return (
                      <Button
                        key={r.value}
                        size="small"
                        variant={active ? 'contained' : 'outlined'}
                        color={active ? 'primary' : 'inherit'}
                        onClick={() => setChartRange(r.value)}
                        sx={{
                          py: 0.5,
                          px: 1.25,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          borderRadius: 1.5,
                          minWidth: 'auto',
                          bgcolor: active ? undefined : alpha(theme.palette.grey[500], 0.06)
                        }}
                      >
                        {lang === 'vi' ? r.labelVi : r.labelEn}
                      </Button>
                    );
                  })}
                </Stack>
              </Stack>
            </Stack>

            {/* Spike & Drop Indicators Strip */}
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} sm={6} md={3}>
                <Card variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 2, borderColor: totalDrops > 0 ? 'error.main' : 'divider' }}>
                  <Box sx={{ color: totalDrops > 0 ? 'error.main' : 'success.main' }}>
                    <AlertOctagon size={24} />
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                      GÓI TIN BỊ DROP (TIMEOUT)
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: totalDrops > 0 ? 'error.main' : 'success.main' }}>
                      {totalDrops} gói rớt ({chartMetrics.length > 0 ? ((totalDrops / chartMetrics.length) * 100).toFixed(1) : 0}%)
                    </Typography>
                  </Box>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 2, borderColor: totalSpikes > 0 ? 'warning.main' : 'divider' }}>
                  <Box sx={{ color: maxSpike > 100 ? 'warning.main' : 'primary.main' }}>
                    <Activity size={24} />
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                      ĐỈNH SPIKE CAO NHẤT
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: maxSpike > 100 ? 'warning.main' : 'text.primary' }}>
                      {maxSpike} ms {totalSpikes > 0 && <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>({totalSpikes} spikes)</span>}
                    </Typography>
                  </Box>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 2 }}>
                  <Box sx={{ color: 'primary.main' }}>
                    <Clock size={24} />
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                      ĐỘ TRỄ TRUNG BÌNH
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main' }}>
                      {avgLatency} ms
                    </Typography>
                  </Box>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 2 }}>
                  <Box sx={{ color: 'info.main' }}>
                    <TrendingUp size={24} />
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                      ĐỘ BIẾN ĐỘNG (JITTER)
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                      ±{jitterVal} ms
                    </Typography>
                  </Box>
                </Card>
              </Grid>
            </Grid>

            {/* Chart Render */}
            <Box sx={{ pt: 1, minHeight: 260 }}>
              {loadingChart && <LinearProgress sx={{ mb: 1, borderRadius: 1 }} />}
              <Chart
                key={`ping_chart_${currentTab}_${chartTargetId}_${chartRange}_${chartMetrics.length}`}
                type="area"
                series={chartSeries}
                options={pingChartOptions}
                height={260}
              />
            </Box>
          </Card>

          {/* Tag Filter Pills */}
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
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
                          {/* Pause / Resume Button (Super Admin) */}
                          {isSuperAdmin && (
                            <IconButton
                              size="small"
                              color={target.enabled ? 'warning' : 'success'}
                              onClick={(e) => handleToggleTargetEnabled(target, e)}
                              title={target.enabled ? 'Tạm dừng ping' : 'Tiếp tục ping'}
                            >
                              {target.enabled ? <Pause size={14} /> : <Play size={14} />}
                            </IconButton>
                          )}

                          {/* Edit Button (Super Admin) */}
                          {isSuperAdmin && (
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={(e) => handleOpenEditTarget(target, e)}
                              title="Sửa target"
                            >
                              <Edit2 size={14} />
                            </IconButton>
                          )}

                          {/* Instant Ping Button */}
                          <IconButton
                            size="small"
                            onClick={(e) => handlePingNow(target.id, e)}
                            title="Ping ngay"
                          >
                            <RotateCcw size={14} />
                          </IconButton>

                          {/* Delete Button (Super Admin) */}
                          {isSuperAdmin && (
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setConfirmDeleteId(target.id)}
                              title="Xóa target"
                            >
                              <Trash2 size={14} />
                            </IconButton>
                          )}
                        </Stack>
                      </Stack>
                    </Box>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Stack>
      </Box>

      {/* ==================================================== */}
      {/* TAB 2: SUBNET SCANNER WITH ARP, HOSTNAME & 20 HISTORY */}
      {/* ==================================================== */}
      <Box sx={{ display: currentTab === 1 ? 'block' : 'none' }}>
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
                    <TableCell sx={{ fontWeight: 700 }}>Tên / Thiết bị (Có thể đổi tên)</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Địa chỉ MAC</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Độ trễ</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Trạng thái</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Hành động</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!scanState.results || scanState.results.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                        Chưa có thiết bị nào được quét. Hãy nhấn "Bắt đầu quét mạng".
                      </TableCell>
                    </TableRow>
                  ) : (
                    scanState.results.map((item, idx) => (
                      <TableRow key={idx} hover>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{item.ip}</TableCell>
                        <TableCell>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: item.customName ? 800 : 600, color: item.customName ? 'primary.main' : 'text.primary' }}>
                                {item.hostname || '--'}
                              </Typography>
                              {item.customName && item.autoName && item.customName !== item.autoName && (
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.7rem' }}>
                                  Gốc: {item.autoName}
                                </Typography>
                              )}
                            </Box>
                            <Tooltip title="Đổi tên cho IP này">
                              <IconButton
                                size="small"
                                onClick={() => handleOpenEditIpName(item.ip, item.hostname)}
                                sx={{ opacity: 0.6, '&:hover': { opacity: 1, color: 'primary.main' } }}
                              >
                                <Edit2 size={13} />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{item.mac || 'N/A'}</TableCell>
                        <TableCell>{item.latency} ms</TableCell>
                        <TableCell>
                          <Label variant="soft" color="success">
                            Trực tuyến
                          </Label>
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

          {/* Scan History (Pinned on top, preserved forever) */}
          <Card sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <History size={20} color={theme.palette.primary.main} /> Lịch sử quét mạng (Bản ghi đã ghim & 20 lần gần nhất)
            </Typography>

            {scanHistoryList.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Chưa có lịch sử phiên quét nào.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {scanHistoryList.map((session, idx) => (
                  <Accordion
                    key={session.id || idx}
                    variant="outlined"
                    sx={{
                      borderRadius: 1.5,
                      borderColor: session.isPinned ? alpha(theme.palette.primary.main, 0.5) : 'divider',
                      bgcolor: session.isPinned ? alpha(theme.palette.primary.main, 0.03) : 'background.paper'
                    }}
                  >
                    <AccordionSummary expandIcon={<ChevronDown size={18} />}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: 1, pr: 2 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Tooltip title={session.isPinned ? "Bỏ ghim phiên này" : "Ghim phiên này (Luôn ở đầu, không bao giờ tự xóa)"}>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePinHistory(session.id);
                              }}
                              color={session.isPinned ? "primary" : "default"}
                              sx={{
                                bgcolor: session.isPinned ? alpha(theme.palette.primary.main, 0.15) : 'action.hover',
                                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.25) }
                              }}
                            >
                              <Pin
                                size={16}
                                style={{
                                  transform: session.isPinned ? 'rotate(-45deg)' : 'none',
                                  fill: session.isPinned ? theme.palette.primary.main : 'none'
                                }}
                              />
                            </IconButton>
                          </Tooltip>

                          {session.isPinned && (
                            <Label variant="filled" color="primary" startIcon={<Pin size={11} />}>
                              ĐÃ GHIM
                            </Label>
                          )}

                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {session.subnet}
                          </Typography>
                          <Label variant="soft" color="primary">
                            {session.totalDiscovered} thiết bị
                          </Label>
                        </Stack>

                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {session.scannedAt ? new Date(session.scannedAt).toLocaleString() : '--'}
                          </Typography>
                          <Tooltip title="Xóa phiên lịch sử này">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteHistorySession(session.id);
                              }}
                              sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}
                            >
                              <Trash2 size={15} />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Stack>
                    </AccordionSummary>
                    <AccordionDetails>
                      <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 700 }}>IP</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>Tên / Thiết bị (Có thể đổi tên)</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>MAC</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>Latency</TableCell>
                              <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Thao tác</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {(session.results || []).map((res, rIdx) => (
                              <TableRow key={rIdx} hover>
                                <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{res.ip}</TableCell>
                                <TableCell>
                                  <Stack direction="row" alignItems="center" spacing={1}>
                                    <Box sx={{ minWidth: 0 }}>
                                      <Typography variant="body2" sx={{ fontWeight: res.customName ? 800 : 600, color: res.customName ? 'primary.main' : 'text.primary' }}>
                                        {res.hostname || '--'}
                                      </Typography>
                                      {res.customName && res.autoName && res.customName !== res.autoName && (
                                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.7rem' }}>
                                          Gốc: {res.autoName}
                                        </Typography>
                                      )}
                                    </Box>
                                    <Tooltip title="Đổi tên cho IP này">
                                      <IconButton
                                        size="small"
                                        onClick={() => handleOpenEditIpName(res.ip, res.hostname)}
                                        sx={{ opacity: 0.6, '&:hover': { opacity: 1, color: 'primary.main' } }}
                                      >
                                        <Edit2 size={13} />
                                      </IconButton>
                                    </Tooltip>
                                  </Stack>
                                </TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{res.mac || 'N/A'}</TableCell>
                                <TableCell>{res.latency} ms</TableCell>
                                <TableCell sx={{ textAlign: 'right' }}>
                                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                                    {res.mac && res.mac !== 'N/A' && (
                                      <Button
                                        size="small"
                                        variant="outlined"
                                        color="primary"
                                        startIcon={<Zap size={14} />}
                                        disabled={wolLoadingMac === res.mac}
                                        onClick={() => handleSendWol(res.mac, res.hostname || res.ip)}
                                      >
                                        {wolLoadingMac === res.mac ? 'Đang gửi...' : 'WoL'}
                                      </Button>
                                    )}
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="inherit"
                                      startIcon={<SlidersHorizontal size={14} />}
                                      onClick={() => handleOpenAddQueue(res.ip, res.hostname)}
                                    >
                                      Bóp Bandwidth
                                    </Button>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="info"
                                      startIcon={<ArrowUpDown size={14} />}
                                      onClick={() => handleOpenAddNat(res.ip, res.hostname)}
                                    >
                                      Mở Cổng
                                    </Button>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      startIcon={<Plus size={14} />}
                                      onClick={() => handleOpenAddTarget(res.ip, res.hostname || `Device (${res.ip})`)}
                                    >
                                      Theo dõi
                                    </Button>
                                  </Stack>
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
      </Box>

      {/* ==================================================== */}
      {/* TAB 2: GATEWAY / CORE ROUTER MANAGEMENT */}
      {/* ==================================================== */}
      <Box sx={{ display: currentTab === 2 ? 'block' : 'none' }}>
        <Stack spacing={3}>
          {/* Gateway Device Selector Toolbar */}
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            alignItems={{ xs: 'flex-start', md: 'center' }}
            justifyContent="space-between"
            spacing={2}
            sx={{ flexWrap: 'wrap', gap: 1.5 }}
          >
            {/* Dynamic Gateway Device Switchers */}
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
              {managedGateways.map(gw => {
                const active = currentGatewayDevice?.id === gw.id;
                return (
                  <Button
                    key={gw.id}
                    variant={active ? 'contained' : 'outlined'}
                    color={gw.type === 'mikrotik' ? 'primary' : 'info'}
                    startIcon={gw.type === 'mikrotik' ? <Shield size={16} /> : <Server size={16} />}
                    onClick={() => {
                      setSelectedGatewayId(gw.id);
                    }}
                    sx={{ fontWeight: 700, borderRadius: 2 }}
                  >
                    {gw.name} ({gw.host})
                  </Button>
                );
              })}
            </Stack>

            {/* SuperAdmin CRUD */}
            {isSuperAdmin && (
              <Stack direction="row" spacing={1} alignItems="center">
                {currentGatewayDevice && (
                  <Tooltip title="Chỉnh sửa Gateway này">
                    <Button
                      size="small"
                      variant="outlined"
                      color="inherit"
                      startIcon={<Edit2 size={15} />}
                      onClick={() => handleOpenEditDevice(currentGatewayDevice)}
                      sx={{ fontWeight: 700 }}
                    >
                      Sửa
                    </Button>
                  </Tooltip>
                )}

                {currentGatewayDevice && (
                  <Tooltip title="Xóa Gateway khỏi quản lý">
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<Trash2 size={15} />}
                      onClick={() => setConfirmDeleteDeviceId(currentGatewayDevice.id)}
                      sx={{ fontWeight: 700 }}
                    >
                      Xóa
                    </Button>
                  </Tooltip>
                )}

                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  startIcon={<Plus size={15} />}
                  onClick={() => handleOpenAddDevice('gateway')}
                  sx={{ fontWeight: 700 }}
                >
                  + Thêm Gateway
                </Button>
              </Stack>
            )}
          </Stack>

          {/* Empty State when no Gateways configured */}
          {managedGateways.length === 0 && (
            <Card sx={{ p: 5, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
              <Box sx={{ color: 'text.secondary', display: 'flex', justifyContent: 'center', mb: 2 }}>
                <Shield size={56} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
                Chưa có thiết bị Gateway nào được quản lý
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, maxWidth: 500, mx: 'auto' }}>
                Hệ thống chưa kết nối thiết bị Gateway nào. Bạn có thể thêm thiết bị MikroTik RouterOS hoặc OpenWrt/ImmortalWrt Gateway để bắt đầu quản lý băng thông và NAT.
              </Typography>
              {isSuperAdmin && (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<Plus size={16} />}
                  onClick={() => handleOpenAddDevice('gateway')}
                  sx={{ fontWeight: 700 }}
                >
                  Thêm Gateway Ngay
                </Button>
              )}
            </Card>
          )}

          {/* MIKROTIK VIEW */}
          {managedGateways.length > 0 && activeGatewayType === 'mikrotik' && (
            loadingMikrotik && !mikrotikStatus ? (
              <LinearProgress sx={{ my: 4, borderRadius: 2 }} />
            ) : !mikrotikStatus ? (
              <Card sx={{ p: 4, textAlign: 'center' }}>
                <Shield size={48} color={theme.palette.text.disabled} />
                <Typography variant="h6" sx={{ mt: 2, fontWeight: 700 }}>
                  Không thể kết nối MikroTik RouterOS ({mikrotikHost})
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                  Vui lòng kiểm tra lại địa chỉ IP, cổng REST API (80/443) và thông tin đăng nhập trong phần Cấu hình.
                </Typography>
                <Button variant="contained" startIcon={<Settings size={16} />} onClick={handleOpenMikrotikConfig}>
                  Cấu hình kết nối MikroTik
                </Button>
              </Card>
            ) : (
              <Stack spacing={3}>
                {/* MikroTik Banner */}
                <Card sx={{ p: 3, background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${theme.palette.background.paper} 100%)` }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center" justifyContent="space-between" spacing={2.5}>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Box sx={{ width: 56, height: 56, borderRadius: 2.5, bgcolor: 'primary.main', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Shield size={32} />
                      </Box>
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: 1 }}>
                            MIKROTIK CORE ROUTER & PPPOE GATEWAY
                          </Typography>
                          <Label variant="soft" color={mikrotikStatus.online ? 'success' : 'error'}>
                            {mikrotikStatus.online ? 'Online' : 'Offline'}
                          </Label>
                          {mikrotikStatus.isApiConnected && (
                            <Label variant="soft" color="info">API Connected</Label>
                          )}
                        </Stack>
                        <Typography variant="h4" sx={{ fontWeight: 800 }}>
                          {mikrotikStatus.routerName}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                          Host: {mikrotikStatus.host} • Model: {mikrotikStatus.hardware} • OS: {mikrotikStatus.version} • Uptime: {mikrotikStatus.uptimeFormatted}
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
                      <Button
                        variant="outlined"
                        color="warning"
                        startIcon={<RefreshCw size={16} />}
                        onClick={() => setConfirmReconnectPppoeOpen(true)}
                        sx={{ fontWeight: 700 }}
                      >
                        Làm mới IP PPPoE
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        startIcon={<Power size={16} />}
                        onClick={() => setConfirmMikrotikRebootOpen(true)}
                        sx={{ fontWeight: 700 }}
                      >
                        Reboot RouterOS
                      </Button>
                      <Button
                        variant="contained"
                        color="inherit"
                        startIcon={<Settings size={16} />}
                        onClick={handleOpenMikrotikConfig}
                        sx={{ fontWeight: 700 }}
                      >
                        Cấu hình API
                      </Button>
                    </Stack>
                  </Stack>
                </Card>

                {/* MikroTik Telemetry & Bandwidth Cards */}
                <Grid container spacing={2.5}>
                  {/* PPPoE WAN Status Card */}
                  <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ p: 2.5, height: '100%' }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                          PPPOE PUBLIC WAN
                        </Typography>
                        <Label variant="soft" color={mikrotikStatus.wan?.pppoeStatus === 'online' ? 'success' : 'warning'}>
                          {mikrotikStatus.wan?.pppoeStatus === 'online' ? 'Connected' : 'Offline'}
                        </Label>
                      </Stack>
                      <Typography variant="h5" sx={{ fontWeight: 800, my: 0.5, color: 'primary.main', fontFamily: 'monospace' }}>
                        {mikrotikStatus.wan?.ip || '--'}
                      </Typography>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                          User: {showPppoeUser ? (mikrotikStatus.wan?.pppoeUser || '--') : (mikrotikStatus.wan?.pppoeUser ? '••••••••' : '--')}
                        </Typography>
                        {mikrotikStatus.wan?.pppoeUser && (
                          <Tooltip title={showPppoeUser ? "Ẩn tài khoản PPPoE" : "Hiện tài khoản PPPoE"}>
                            <IconButton
                              size="small"
                              onClick={() => setShowPppoeUser(v => !v)}
                              sx={{ p: 0.2, color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
                            >
                              {showPppoeUser ? <EyeOff size={13} /> : <Eye size={13} />}
                            </IconButton>
                          </Tooltip>
                        )}
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                          • {mikrotikStatus.wan?.interface}
                        </Typography>
                      </Stack>
                    </Card>
                  </Grid>

                  {/* Realtime Bandwidth Tx/Rx */}
                  <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ p: 2.5, height: '100%' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        BĂNG THÔNG TỨC THỜI (PPPOE)
                      </Typography>
                      <Stack direction="row" spacing={2} sx={{ my: 0.5 }}>
                        <Box>
                          <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <ArrowDown size={14} /> Download
                          </Typography>
                          <Typography variant="h6" sx={{ fontWeight: 800 }}>
                            {mikrotikStatus.bandwidth?.rxMbps || 0} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>Mbps</span>
                          </Typography>
                        </Box>
                        <Divider orientation="vertical" flexItem />
                        <Box>
                          <Typography variant="caption" sx={{ color: 'info.main', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <ArrowUp size={14} /> Upload
                          </Typography>
                          <Typography variant="h6" sx={{ fontWeight: 800 }}>
                            {mikrotikStatus.bandwidth?.txMbps || 0} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>Mbps</span>
                          </Typography>
                        </Box>
                      </Stack>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                        Cập nhật thời gian thực
                      </Typography>
                    </Card>
                  </Grid>

                  {/* CPU Load & Hardware */}
                  <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ p: 2.5, height: '100%' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        TẢI CPU ROUTEROS
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 800, my: 0.5, color: mikrotikStatus.cpu > 80 ? 'error.main' : 'text.primary' }}>
                        {mikrotikStatus.cpu}%
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                        {mikrotikStatus.cpuCount} Cores • {mikrotikStatus.cpuFrequency} MHz ({mikrotikStatus.architecture})
                      </Typography>
                    </Card>
                  </Grid>

                  {/* Memory RAM */}
                  <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ p: 2.5, height: '100%' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        BỘ NHỚ RAM KHẢ DỤNG
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 800, my: 0.5 }}>
                        {mikrotikStatus.memory}%
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                        {mikrotikStatus.memoryFreeMb} MB còn trống / {mikrotikStatus.memoryTotalMb} MB
                      </Typography>
                    </Card>
                  </Grid>
                </Grid>

                {/* Sub-Tabs: Leases / Simple Queues / NAT Rules */}
                <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 1 }}>
                  <Tabs value={mikrotikSubTab} onChange={(_, val) => setMikrotikSubTab(val)}>
                    <Tab
                      value="leases"
                      label={`DHCP Leases (${mikrotikStatus.dhcpLeases?.length || 0})`}
                      icon={<Users size={16} />}
                      iconPosition="start"
                      sx={{ fontWeight: 700 }}
                    />
                    <Tab
                      value="queues"
                      label={`Giới hạn Băng thông (${mikrotikQueues.length})`}
                      icon={<SlidersHorizontal size={16} />}
                      iconPosition="start"
                      sx={{ fontWeight: 700 }}
                    />
                    <Tab
                      value="nat"
                      label={`Port Forwarding & NAT (${mikrotikNatRules.length})`}
                      icon={<ArrowUpDown size={16} />}
                      iconPosition="start"
                      sx={{ fontWeight: 700 }}
                    />
                  </Tabs>
                </Box>

                {/* Sub-Tab 1: DHCP Leases */}
                {mikrotikSubTab === 'leases' && (
                  <Card sx={{ p: 3 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        Danh sách cấp phát IP DHCP Leases ({filteredLeases.length})
                      </Typography>
                      <TextField
                        size="small"
                        placeholder="Tìm kiếm IP, hostname, MAC..."
                        value={leaseSearch}
                        onChange={(e) => setLeaseSearch(e.target.value)}
                        sx={{ minWidth: 260 }}
                      />
                    </Stack>

                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Địa chỉ IP</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Tên thiết bị (Host)</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>MAC Address</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Trạng thái</TableCell>
                            <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Thao tác</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {filteredLeases.map((lease, idx) => (
                            <TableRow key={lease.id || idx}>
                              <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                                {lease.ip}
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  {lease.hostname || 'Chưa đặt tên'}
                                </Typography>
                                {lease.comment && (
                                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                    {lease.comment}
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                {lease.mac}
                              </TableCell>
                              <TableCell>
                                <Label variant="soft" color={lease.status === 'bound' ? 'success' : 'default'}>
                                  {lease.status}
                                </Label>
                              </TableCell>
                              <TableCell sx={{ textAlign: 'right' }}>
                                <Stack direction="row" spacing={1} justifyContent="flex-end">
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="primary"
                                    startIcon={<Zap size={14} />}
                                    disabled={wolLoadingMac === lease.mac}
                                    onClick={() => handleSendWol(lease.mac)}
                                  >
                                    {wolLoadingMac === lease.mac ? 'Đang gửi...' : 'Bật máy (WoL)'}
                                  </Button>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="inherit"
                                    startIcon={<SlidersHorizontal size={14} />}
                                    onClick={() => handleOpenAddQueue(lease.ip, lease.hostname)}
                                  >
                                    Bóp Bandwidth
                                  </Button>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="info"
                                    startIcon={<ArrowUpDown size={14} />}
                                    onClick={() => handleOpenAddNat(lease.ip, lease.hostname)}
                                  >
                                    Mở Cổng
                                  </Button>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<Plus size={14} />}
                                    onClick={() => handleOpenAddTarget(lease.ip, lease.hostname)}
                                  >
                                    Theo dõi
                                  </Button>
                                </Stack>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Card>
                )}

                {/* Sub-Tab 2: Simple Queues */}
                {mikrotikSubTab === 'queues' && (
                  <Card sx={{ p: 3 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                          <SlidersHorizontal size={20} color={theme.palette.primary.main} /> Quản lý Băng thông & Giới hạn Tốc độ (Simple Queues)
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          Thiết lập mức trần Upload/Download theo từng IP thiết bị hoặc dải mạng để tránh nghẽn mạng
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1.5}>
                        <Button
                          variant="contained"
                          color="primary"
                          startIcon={<Plus size={16} />}
                          onClick={() => {
                            setQueueForm({ id: '', name: '', target: '', uploadLimit: '10M', downloadLimit: '20M', comment: '' });
                            setQueueDialogOpen(true);
                          }}
                          sx={{ fontWeight: 700 }}
                        >
                          Thêm giới hạn
                        </Button>
                        <Button size="small" variant="outlined" startIcon={<RefreshCw size={14} />} onClick={loadMikrotikQueues}>
                          Làm mới
                        </Button>
                      </Stack>
                    </Stack>

                    {loadingQueues && mikrotikQueues.length === 0 ? (
                      <LinearProgress sx={{ my: 3, borderRadius: 1.5 }} />
                    ) : (
                      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 700 }}>Tên quy tắc</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>IP Mục tiêu (Target)</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>Mức trần (Upload / Download)</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>Tốc độ thực tế (Tx / Rx)</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>Ghi chú</TableCell>
                              <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Thao tác</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {mikrotikQueues.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                                  Chưa có quy tắc giới hạn băng thông nào. Nhấn "Thêm giới hạn" hoặc chọn từ bảng DHCP Leases để tạo quy tắc.
                                </TableCell>
                              </TableRow>
                            ) : (
                              mikrotikQueues.map((q) => (
                                <TableRow key={q.id} hover>
                                  <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{q.name}</TableCell>
                                  <TableCell sx={{ fontWeight: 700, color: 'primary.main', fontFamily: 'monospace' }}>{q.target}</TableCell>
                                  <TableCell>
                                    <Chip
                                      size="small"
                                      label={`⬆️ ${q.uploadLimitMbps ? q.uploadLimitMbps + ' Mbps' : 'Unlimited'} / ⬇️ ${q.downloadLimitMbps ? q.downloadLimitMbps + ' Mbps' : 'Unlimited'}`}
                                      color="info"
                                      variant="outlined"
                                      sx={{ fontWeight: 700 }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8rem' }}>
                                      ⬆️ {q.uploadRateMbps || 0} Mbps • ⬇️ {q.downloadRateMbps || 0} Mbps
                                    </Typography>
                                  </TableCell>
                                  <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>{q.comment || '--'}</TableCell>
                                  <TableCell sx={{ textAlign: 'right' }}>
                                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                                      <IconButton
                                        size="small"
                                        color="primary"
                                        onClick={() => {
                                          const parts = (q.maxLimit || '10M/20M').split('/');
                                          setQueueForm({
                                            id: q.id,
                                            name: q.name,
                                            target: q.target ? q.target.replace('/32', '') : '',
                                            uploadLimit: parts[0] || '10M',
                                            downloadLimit: parts[1] || '20M',
                                            comment: q.comment || ''
                                          });
                                          setQueueDialogOpen(true);
                                        }}
                                      >
                                        <Edit2 size={15} />
                                      </IconButton>
                                      <IconButton
                                        size="small"
                                        color="error"
                                        onClick={() => setConfirmDeleteQueueId(q.id)}
                                      >
                                        <Trash2 size={15} />
                                      </IconButton>
                                    </Stack>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Card>
                )}

                {/* Sub-Tab 3: NAT & Firewall */}
                {mikrotikSubTab === 'nat' && (
                  <Card sx={{ p: 3 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Shield size={20} color={theme.palette.primary.main} /> Bảng Quy Tắc Chuyển Tiếp Cổng (Port Forwarding & NAT)
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          Các quy tắc NAT / Firewall trên RouterOS điều phối lưu lượng mạng ra vào
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1.5}>
                        <Button
                          variant="contained"
                          color="primary"
                          startIcon={<Layers size={16} />}
                          onClick={handleOpenNatTemplates}
                          sx={{ fontWeight: 700 }}
                        >
                          Mẫu NAT có sẵn
                        </Button>
                        <Button
                          variant="outlined"
                          color="primary"
                          startIcon={<Plus size={16} />}
                          onClick={() => {
                            setNatForm({
                              chain: 'dstnat',
                              action: 'dst-nat',
                              protocol: 'tcp',
                              dstPort: '',
                              toAddresses: '',
                              toPorts: '',
                              inInterface: '',
                              outInterface: '',
                              comment: ''
                            });
                            setNatFormDialogOpen(true);
                          }}
                          sx={{ fontWeight: 700 }}
                        >
                          Tạo NAT
                        </Button>
                        <Button size="small" variant="outlined" startIcon={<RefreshCw size={14} />} onClick={() => loadMikrotikNat(false)}>
                          Làm mới
                        </Button>
                      </Stack>
                    </Stack>

                    {loadingNat && mikrotikNatRules.length === 0 ? (
                      <LinearProgress sx={{ my: 3, borderRadius: 1.5 }} />
                    ) : (
                      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 700 }}>Chain / Action</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>Giao thức & Cổng đến</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>Chuyển tiếp đến (To IP:Port)</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>Ghi chú / Comment</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>Trạng thái</TableCell>
                              <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Thao tác</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {mikrotikNatRules.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                                  Không tìm thấy quy tắc NAT nào trên RouterOS. Nhấn "Mẫu NAT có sẵn" để tạo nhanh các cấu hình thông dụng.
                                </TableCell>
                              </TableRow>
                            ) : (
                              mikrotikNatRules.map((rule) => (
                                <TableRow key={rule.id} hover sx={{ opacity: rule.disabled ? 0.6 : 1 }}>
                                  <TableCell>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                      <Label variant="soft" color={rule.chain === 'dstnat' ? 'warning' : 'primary'}>
                                        {rule.chain}
                                      </Label>
                                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                        {rule.action}
                                      </Typography>
                                    </Stack>
                                  </TableCell>
                                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                    {rule.protocol !== 'all' ? `${rule.protocol.toUpperCase()} : ${rule.dstPort || 'Any'}` : (rule.outInterface ? `Out: ${rule.outInterface}` : 'All Traffic')}
                                  </TableCell>
                                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.main' }}>
                                    {rule.toAddresses ? `${rule.toAddresses}${rule.toPorts ? ':' + rule.toPorts : ''}` : '--'}
                                  </TableCell>
                                  <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>{rule.comment || '--'}</TableCell>
                                  <TableCell>
                                    <FormControlLabel
                                      control={
                                        <Switch
                                          checked={!rule.disabled}
                                          onChange={() => handleToggleNat(rule.id, rule.disabled)}
                                          color="success"
                                          size="small"
                                        />
                                      }
                                      label={!rule.disabled ? 'Bật' : 'Tắt'}
                                      sx={{ m: 0 }}
                                    />
                                  </TableCell>
                                  <TableCell sx={{ textAlign: 'right' }}>
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={() => setConfirmDeleteNatId(rule.id)}
                                    >
                                      <Trash2 size={15} />
                                    </IconButton>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Card>
                )}
              </Stack>
            )
          )}

          {/* OPENWRT / IMMORTALWRT GATEWAY VIEW */}
          {managedGateways.length > 0 && (activeGatewayType === 'openwrt' || activeGatewayType === 'immortalwrt' || activeGatewayType === 'generic') && (
            <OpenWrtSection
              status={openwrtStatus}
              loading={loadingOpenwrt}
              onRestartNetwork={handleOpenwrtRestartNetwork}
              onReboot={handleOpenwrtReboot}
              onOpenConfig={() => handleOpenEditDevice(currentGatewayDevice || { role: 'gateway', type: 'openwrt', host: '192.168.1.1', port: 80 })}
              onOpenAddTarget={handleOpenAddTarget}
              onSendWol={handleSendWol}
              onOpenAddQueue={handleOpenAddQueue}
              onOpenAddNat={handleOpenAddNat}
              wolLoadingMac={wolLoadingMac}
            />
          )}
        </Stack>
      </Box>

      {/* ==================================================== */}
      {/* TAB 3: ROUTER & WI-FI MESH MANAGEMENT */}
      {/* ==================================================== */}
      <Box sx={{ display: currentTab === 3 ? 'block' : 'none' }}>
        <Stack spacing={3}>
          {/* Router / Mesh Device Selector Toolbar */}
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            alignItems={{ xs: 'flex-start', md: 'center' }}
            justifyContent="space-between"
            spacing={2}
            sx={{ flexWrap: 'wrap', gap: 1.5 }}
          >
            {/* Dynamic Router & Mesh Switchers */}
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
              {managedRouterMeshes.map(r => {
                const active = currentRouterMeshDevice?.id === r.id;
                const getIcon = (type) => {
                  if (type === 'tplink_deco') return <Radio size={16} />;
                  if (type === 'zte') return <Zap size={16} />;
                  if (type === 'gecoos') return <RouterIcon size={16} />;
                  return <Wifi size={16} />;
                };
                return (
                  <Button
                    key={r.id}
                    variant={active ? 'contained' : 'outlined'}
                    color="primary"
                    startIcon={getIcon(r.type)}
                    onClick={() => {
                      setSelectedRouterDeviceId(r.id);
                      setSelectedRouterHost(r.host);
                    }}
                    sx={{ fontWeight: 700, borderRadius: 2 }}
                  >
                    {r.name} ({r.host})
                  </Button>
                );
              })}
            </Stack>

            {/* SuperAdmin CRUD */}
            {isSuperAdmin && (
              <Stack direction="row" spacing={1} alignItems="center">
                {currentRouterMeshDevice && (
                  <Tooltip title="Chỉnh sửa thiết bị này">
                    <Button
                      size="small"
                      variant="outlined"
                      color="inherit"
                      startIcon={<Edit2 size={15} />}
                      onClick={() => handleOpenEditDevice(currentRouterMeshDevice)}
                      sx={{ fontWeight: 700 }}
                    >
                      Sửa
                    </Button>
                  </Tooltip>
                )}

                {currentRouterMeshDevice && (
                  <Tooltip title="Xóa thiết bị khỏi quản lý">
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<Trash2 size={15} />}
                      onClick={() => setConfirmDeleteDeviceId(currentRouterMeshDevice.id)}
                      sx={{ fontWeight: 700 }}
                    >
                      Xóa
                    </Button>
                  </Tooltip>
                )}

                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  startIcon={<Plus size={15} />}
                  onClick={() => handleOpenAddDevice('router_mesh')}
                  sx={{ fontWeight: 700 }}
                >
                  + Thêm Router/Mesh
                </Button>
              </Stack>
            )}
          </Stack>

          {/* Empty State when no Router / Mesh configured */}
          {managedRouterMeshes.length === 0 && (
            <Card sx={{ p: 5, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
              <Box sx={{ color: 'text.secondary', display: 'flex', justifyContent: 'center', mb: 2 }}>
                <Wifi size={56} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
                Chưa có thiết bị Router / Wi-Fi Mesh nào được quản lý
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, maxWidth: 500, mx: 'auto' }}>
                Hệ thống chưa kết nối thiết bị Router hoặc Wi-Fi Mesh nào. Bạn có thể thêm thiết bị Xiaomi Mesh, TP-Link Deco, ZTE EasyMesh hoặc Gecoos AP để theo dõi topology và thiết bị kết nối.
              </Typography>
              {isSuperAdmin && (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<Plus size={16} />}
                  onClick={() => handleOpenAddDevice('router_mesh')}
                  sx={{ fontWeight: 700 }}
                >
                  Thêm Router/Mesh Ngay
                </Button>
              )}
            </Card>
          )}

          {/* TP-LINK DECO MESH VIEW */}
          {managedRouterMeshes.length > 0 && activeRouterMeshType === 'tplink_deco' && (
            <TPLinkDecoSection
              status={decoStatus}
              loading={loadingDeco}
              onRestartWifi={handleDecoRestartWifi}
              onReboot={handleDecoReboot}
              onOpenConfig={() => handleOpenEditDevice(currentRouterMeshDevice || { role: 'router_mesh', type: 'tplink_deco', host: '192.168.1.1', port: 80 })}
              onOpenAddTarget={handleOpenAddTarget}
              onSendWol={handleSendWol}
              onOpenAddQueue={handleOpenAddQueue}
              onOpenAddNat={handleOpenAddNat}
              wolLoadingMac={wolLoadingMac}
            />
          )}

          {/* ZTE EASYMESH & ONT VIEW */}
          {managedRouterMeshes.length > 0 && activeRouterMeshType === 'zte' && (
            <ZTESection
              status={zteStatus}
              loading={loadingZte}
              onRestartWifi={handleZteRestartWifi}
              onReboot={handleZteReboot}
              onOpenConfig={() => handleOpenEditDevice(currentRouterMeshDevice || { role: 'router_mesh', type: 'zte', host: '192.168.1.1', port: 80 })}
              onOpenAddTarget={handleOpenAddTarget}
              onSendWol={handleSendWol}
              onOpenAddQueue={handleOpenAddQueue}
              onOpenAddNat={handleOpenAddNat}
              wolLoadingMac={wolLoadingMac}
            />
          )}

          {/* XIAOMI & GECOOS AP VIEW */}
          {managedRouterMeshes.length > 0 && (activeRouterMeshType === 'xiaomi' || activeRouterMeshType === 'gecoos' || activeRouterMeshType === 'generic') && (
            loadingRouter ? (
              <LinearProgress sx={{ my: 4, borderRadius: 2 }} />
            ) : !routerStatus ? (
              <Card sx={{ p: 4, textAlign: 'center' }}>
                <Wifi size={48} color={theme.palette.text.disabled} />
                <Typography variant="h6" sx={{ mt: 2, fontWeight: 700 }}>
                  Không thể kết nối AP ({selectedRouterHost})
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                  Kiểm tra lại kết nối mạng và mật khẩu quản trị (@nmhung1993).
                </Typography>
                <Button variant="contained" startIcon={<Settings size={16} />} onClick={() => setRouterConfigOpen(true)}>
                  Cấu hình kết nối Router AP
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
                          {selectedRouterType === 'gecoos' ? 'GECOOS ENTERPRISE ACCESS POINT' : 'XIAOMI WI-FI AP & MESH CONTROLLER'}
                        </Typography>
                        <Typography variant="h4" sx={{ fontWeight: 800 }}>
                          {routerStatus.routerName}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                          Host: {routerStatus.host} • ROM: {routerStatus.version} • {routerStatus.uptimeFormatted}
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={1.5}>
                      <Button
                        variant="outlined"
                        color="warning"
                        startIcon={<RotateCcw size={16} />}
                        onClick={() => setConfirmWifiRestartTarget({ ip: routerStatus.host, name: routerStatus.routerName })}
                      >
                        Khởi động lại Wi-Fi
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        startIcon={<Power size={16} />}
                        onClick={() => setConfirmRebootTarget({ ip: routerStatus.host, name: routerStatus.routerName })}
                      >
                        Reboot AP
                      </Button>
                      <Button variant="contained" color="inherit" startIcon={<Settings size={16} />} onClick={() => setRouterConfigOpen(true)}>
                        Cấu hình
                      </Button>
                    </Stack>
                  </Stack>
                </Card>

                {/* Wi-Fi & Load Metric Cards */}
                <Grid container spacing={2.5}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ p: 2.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        TỔNG THIẾT BỊ WI-FI
                      </Typography>
                      <Typography variant="h3" sx={{ fontWeight: 800, my: 0.5, color: 'primary.main' }}>
                        {routerStatus.wifi?.count || routerStatus.clients?.length || 0}
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                        📶 2.4GHz: {routerStatus.wifi?.wifi24Count || 0} • 5GHz: {routerStatus.wifi?.wifi50Count || 0}
                      </Typography>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ p: 2.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        TẢI CPU AP
                      </Typography>
                      <Typography variant="h3" sx={{ fontWeight: 800, my: 0.5 }}>
                        {routerStatus.cpu}%
                      </Typography>
                      <LinearProgress variant="determinate" value={routerStatus.cpu} sx={{ height: 6, borderRadius: 3, mt: 1 }} />
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ p: 2.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        RAM AP
                      </Typography>
                      <Typography variant="h3" sx={{ fontWeight: 800, my: 0.5 }}>
                        {routerStatus.memory}%
                      </Typography>
                      <LinearProgress variant="determinate" value={routerStatus.memory} sx={{ height: 6, borderRadius: 3, mt: 1 }} />
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ p: 2.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        MESH NODES PHỤ
                      </Typography>
                      <Typography variant="h3" sx={{ fontWeight: 800, my: 0.5 }}>
                        {routerStatus.meshNodes?.length || 0}
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                        Tự động đồng bộ IP
                      </Typography>
                    </Card>
                  </Grid>
                </Grid>

                {/* Secondary Mesh Nodes Management Section (if any) */}
                {routerStatus.meshNodes && routerStatus.meshNodes.length > 0 && (
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Layers size={20} color={theme.palette.primary.main} /> Quản lý các Node Mesh phụ ({routerStatus.meshNodes.length})
                    </Typography>

                    <Grid container spacing={2.5}>
                      {routerStatus.meshNodes.map((node) => (
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
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                  TẢI CPU
                                </Typography>
                                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                  {node.cpu}%
                                </Typography>
                              </Box>
                              <Divider orientation="vertical" flexItem />
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                  RAM
                                </Typography>
                                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                  {node.memory}%
                                </Typography>
                              </Box>
                              <Divider orientation="vertical" flexItem />
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                  THIẾT BỊ WI-FI
                                </Typography>
                                <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main' }}>
                                  {node.clientCount}
                                </Typography>
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
                )}

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
                              <Stack direction="row" spacing={1} justifyContent="flex-end">
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="primary"
                                  startIcon={<Zap size={14} />}
                                  disabled={wolLoadingMac === client.mac}
                                  onClick={() => handleSendWol(client.mac, client.name)}
                                >
                                  {wolLoadingMac === client.mac ? 'Đang gửi...' : 'WoL'}
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="inherit"
                                  startIcon={<SlidersHorizontal size={14} />}
                                  onClick={() => handleOpenAddQueue(client.ip, client.name)}
                                >
                                  Bóp Bandwidth
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="info"
                                  startIcon={<ArrowUpDown size={14} />}
                                  onClick={() => handleOpenAddNat(client.ip, client.name)}
                                >
                                  Mở Cổng
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<Plus size={14} />}
                                  onClick={() => handleOpenAddTarget(client.ip, client.name)}
                                >
                                  Theo dõi
                                </Button>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Card>
              </Stack>
            )
          )}
        </Stack>
      </Box>

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
                placeholder="VD: Gecoos Router, Mesh Node 2, Gateway..."
                required
                fullWidth
              />
              <TextField
                label="Địa chỉ IP hoặc Hostname"
                value={targetHost}
                onChange={(e) => setTargetHost(e.target.value)}
                placeholder="VD: 192.168.31.43 hoặc 8.8.8.8"
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

      {/* Router Config Dialog (Xiaomi / Gecoos) */}
      <Dialog open={routerConfigOpen} onClose={() => setRouterConfigOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleSaveRouterConfig}>
          <DialogTitle sx={{ fontWeight: 800 }}>Cấu hình Router AP ({selectedRouterType.toUpperCase()})</DialogTitle>
          <DialogContent>
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              <TextField
                label="Địa chỉ IP AP"
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
            <Button type="submit" variant="contained" color="primary">
              Lưu cấu hình
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* MikroTik Config Dialog */}
      <Dialog open={mikrotikConfigOpen} onClose={() => setMikrotikConfigOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleSaveMikrotikConfig}>
          <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Shield size={22} color={theme.palette.primary.main} /> Cấu hình MikroTik RouterOS API
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Alert severity="info" sx={{ py: 0.5, fontSize: '0.78rem' }}>
                Hỗ trợ trực tiếp cổng <strong>RouterOS API (8728 / 8729)</strong> mặc định không cần mở Web WWW, hoặc cổng REST API (8080 / 8443 / 80 / 443).
              </Alert>

              <TextField
                label="Địa chỉ IP MikroTik"
                value={mikrotikHost}
                onChange={(e) => setMikrotikHost(e.target.value)}
                placeholder="192.168.1.1"
                required
                fullWidth
              />

              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, mb: 1, display: 'block' }}>
                  CHỌN NHANH CỔNG DỊCH VỤ (PORT PRESETS)
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  <Button
                    size="small"
                    variant={Number(mikrotikPort) === 8728 && !mikrotikUseHttps ? 'contained' : 'outlined'}
                    onClick={() => { setMikrotikPort(8728); setMikrotikUseHttps(false); }}
                    sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.75rem' }}
                  >
                    ⚡ API (8728)
                  </Button>
                  <Button
                    size="small"
                    variant={Number(mikrotikPort) === 8729 && mikrotikUseHttps ? 'contained' : 'outlined'}
                    onClick={() => { setMikrotikPort(8729); setMikrotikUseHttps(true); }}
                    sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.75rem' }}
                  >
                    🔒 API-SSL (8729)
                  </Button>
                  <Button
                    size="small"
                    variant={Number(mikrotikPort) === 8080 && !mikrotikUseHttps ? 'contained' : 'outlined'}
                    onClick={() => { setMikrotikPort(8080); setMikrotikUseHttps(false); }}
                    sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.75rem' }}
                  >
                    🌐 WWW (8080)
                  </Button>
                  <Button
                    size="small"
                    variant={Number(mikrotikPort) === 8443 && mikrotikUseHttps ? 'contained' : 'outlined'}
                    onClick={() => { setMikrotikPort(8443); setMikrotikUseHttps(true); }}
                    sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.75rem' }}
                  >
                    🔐 WWW-SSL (8443)
                  </Button>
                </Stack>
              </Box>

              <TextField
                label="Cổng dịch vụ (Port)"
                type="number"
                value={mikrotikPort}
                onChange={(e) => setMikrotikPort(e.target.value)}
                placeholder="8728 hoặc 8729"
                required
                fullWidth
              />
              <TextField
                label="Tên đăng nhập (Username)"
                value={mikrotikUsername}
                onChange={(e) => setMikrotikUsername(e.target.value)}
                placeholder="admin"
                required
                fullWidth
              />
              <TextField
                label="Mật khẩu (Password)"
                type="password"
                value={mikrotikPassword}
                onChange={(e) => setMikrotikPassword(e.target.value)}
                placeholder="Để trống nếu không đặt"
                fullWidth
              />
              <TextField
                label="Tên Interface PPPoE Client"
                value={mikrotikPppoeInterface}
                onChange={(e) => setMikrotikPppoeInterface(e.target.value)}
                placeholder="pppoe-out1"
                helperText="Tên cổng quay số PPPoE trên MikroTik (Mặc định: pppoe-out1)"
                fullWidth
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={mikrotikUseHttps}
                    onChange={(e) => {
                      setMikrotikUseHttps(e.target.checked);
                      if (e.target.checked && Number(mikrotikPort) === 8728) setMikrotikPort(8729);
                      if (!e.target.checked && Number(mikrotikPort) === 8729) setMikrotikPort(8728);
                      if (e.target.checked && Number(mikrotikPort) === 8080) setMikrotikPort(8443);
                      if (!e.target.checked && Number(mikrotikPort) === 8443) setMikrotikPort(8080);
                    }}
                  />
                }
                label="Sử dụng kết nối bảo mật SSL / TLS"
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2.5 }}>
            <Button onClick={() => setMikrotikConfigOpen(false)}>Hủy</Button>
            <Button type="submit" variant="contained" color="primary" sx={{ fontWeight: 700 }}>
              Lưu & Kết nối
            </Button>
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

      {/* Reconnect PPPoE Confirm Dialog */}
      <ConfirmDialog
        open={confirmReconnectPppoeOpen}
        title="Làm mới IP PPPoE (Re-dial WAN)?"
        message="Thao tác này sẽ ngắt và quay lại phiên PPPoE trên MikroTik để nhận IP Public mới từ nhà mạng ISP. Toàn bộ mạng Internet sẽ gián đoạn trong 3-5 giây."
        onConfirm={handleReconnectPppoe}
        onClose={() => setConfirmReconnectPppoeOpen(false)}
      />

      {/* MikroTik Reboot Confirm Dialog */}
      <ConfirmDialog
        open={confirmMikrotikRebootOpen}
        title="Khởi động lại MikroTik RouterOS?"
        message="Bạn có chắc chắn muốn Reboot Router MikroTik? Toàn bộ kết nối mạng nội bộ và Internet sẽ tạm ngắt trong 1 phút."
        onConfirm={handleRebootMikrotik}
        onClose={() => setConfirmMikrotikRebootOpen(false)}
      />

      {/* Reboot Confirm Dialog (Xiaomi / Gecoos) */}
      <ConfirmDialog
        open={Boolean(confirmRebootTarget)}
        title={`Khởi động lại ${confirmRebootTarget?.name || 'Router'}?`}
        message={`Thao tác này sẽ khởi động lại thiết bị tại địa chỉ ${confirmRebootTarget?.ip}. Kết nối mạng LAN/Wi-Fi qua node này sẽ tạm thời gián đoạn trong 1-2 phút.`}
        onConfirm={handleReboot}
        onClose={() => setConfirmRebootTarget(null)}
      />

      {/* MikroTik Simple Queue Limit Dialog */}
      <Dialog open={queueDialogOpen} onClose={() => setQueueDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSaveQueue}>
          <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Sliders size={20} color={theme.palette.primary.main} /> {queueForm.id ? 'Sửa Giới Hạn Băng Thông' : 'Thêm Giới Hạn Băng Thông (Simple Queue)'}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              <TextField
                label="Tên quy tắc (Name)"
                value={queueForm.name}
                onChange={(e) => setQueueForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="VD: limit_camera, limit_guest"
                required
                fullWidth
              />
              <TextField
                label="Địa chỉ IP Mục tiêu (Target IP hoặc Subnet)"
                value={queueForm.target}
                onChange={(e) => setQueueForm(prev => ({ ...prev, target: e.target.value }))}
                placeholder="VD: 192.168.1.50 hoặc 192.168.1.0/24"
                helperText="IP của thiết bị cần bóp băng thông hoặc cả dải mạng"
                required
                fullWidth
              />

              <Box>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
                  CHỌN MỨC GIỚI HẠN NHANH (PRESET)
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  {[
                    { label: '2M / 5M (Tiết kiệm)', up: '2M', down: '5M' },
                    { label: '5M / 10M (Cơ bản)', up: '5M', down: '10M' },
                    { label: '10M / 20M (Chuẩn)', up: '10M', down: '20M' },
                    { label: '20M / 50M (Cao)', up: '20M', down: '50M' },
                    { label: '50M / 100M (Rất cao)', up: '50M', down: '100M' },
                    { label: '0 / 0 (Không giới hạn)', up: '0', down: '0' }
                  ].map((p, idx) => (
                    <Button
                      key={idx}
                      size="small"
                      variant={queueForm.uploadLimit === p.up && queueForm.downloadLimit === p.down ? 'contained' : 'outlined'}
                      onClick={() => setQueueForm(prev => ({ ...prev, uploadLimit: p.up, downloadLimit: p.down }))}
                      sx={{ fontSize: '0.75rem', fontWeight: 700 }}
                    >
                      {p.label}
                    </Button>
                  ))}
                </Stack>
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    label="Giới hạn Upload tối đa"
                    value={queueForm.uploadLimit}
                    onChange={(e) => setQueueForm(prev => ({ ...prev, uploadLimit: e.target.value }))}
                    placeholder="VD: 10M hoặc 512k"
                    helperText="VD: 5M, 10M, 50M (0 là không giới hạn)"
                    fullWidth
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="Giới hạn Download tối đa"
                    value={queueForm.downloadLimit}
                    onChange={(e) => setQueueForm(prev => ({ ...prev, downloadLimit: e.target.value }))}
                    placeholder="VD: 20M hoặc 2M"
                    helperText="VD: 10M, 20M, 100M (0 là không giới hạn)"
                    fullWidth
                  />
                </Grid>
              </Grid>

              <TextField
                label="Ghi chú / Comment"
                value={queueForm.comment}
                onChange={(e) => setQueueForm(prev => ({ ...prev, comment: e.target.value }))}
                placeholder="VD: Bóp băng thông máy khách"
                fullWidth
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2.5 }}>
            <Button onClick={() => setQueueDialogOpen(false)}>Hủy</Button>
            <Button type="submit" variant="contained" color="primary" sx={{ fontWeight: 700 }}>
              {queueForm.id ? 'Cập nhật giới hạn' : 'Áp dụng giới hạn'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Queue Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(confirmDeleteQueueId)}
        title="Xóa quy tắc Giới hạn Băng thông?"
        message="Bạn có chắc muốn gỡ bỏ mức giới hạn tốc độ này trên MikroTik? Thiết bị sẽ trở về tốc độ mạng tối đa không giới hạn."
        onConfirm={() => handleDeleteQueue(confirmDeleteQueueId)}
        onClose={() => setConfirmDeleteQueueId(null)}
      />

      {/* Edit Custom IP Name Dialog */}
      <Dialog open={editNameDialog.open} onClose={() => setEditNameDialog(prev => ({ ...prev, open: false }))} maxWidth="xs" fullWidth>
        <form onSubmit={handleSaveCustomName}>
          <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Edit2 size={20} color={theme.palette.primary.main} /> Đổi tên cho IP {editNameDialog.ip}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Tên tùy chỉnh này sẽ được lưu cố định và hiển thị ưu tiên trên toàn bộ kết quả quét mạng và lịch sử.
              </Typography>
              <TextField
                label="Tên tùy chỉnh / Gợi nhớ"
                value={editNameDialog.newName}
                onChange={(e) => setEditNameDialog(prev => ({ ...prev, newName: e.target.value }))}
                placeholder="VD: Smart TV Phòng Khách, Camera Sân Thượng..."
                autoFocus
                fullWidth
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2.5, justifyContent: 'space-between' }}>
            {customNames[editNameDialog.ip] ? (
              <Button color="error" size="small" onClick={handleClearCustomName}>
                Xóa tên tùy chỉnh
              </Button>
            ) : <Box />}
            <Stack direction="row" spacing={1}>
              <Button onClick={() => setEditNameDialog(prev => ({ ...prev, open: false }))}>
                Hủy
              </Button>
              <Button type="submit" variant="contained" color="primary">
                Lưu tên
              </Button>
            </Stack>
          </DialogActions>
        </form>
      </Dialog>
      {/* NAT Templates Dialog */}
      <Dialog open={natTemplateDialogOpen} onClose={() => setNatTemplateDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Layers size={20} color={theme.palette.primary.main} /> Tập Lệnh Mẫu NAT / Port Forwarding Cơ Bản
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
            Chọn mẫu cấu hình NAT thường dùng bên dưới để tạo quy tắc chuyển tiếp cổng chỉ với 1 click.
          </Typography>
          <Grid container spacing={2}>
            {natTemplates.map((tpl) => (
              <Grid item xs={12} sm={6} key={tpl.id}>
                <Card
                  variant="outlined"
                  sx={{
                    p: 2,
                    height: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    borderRadius: 2,
                    cursor: 'pointer',
                    '&:hover': { borderColor: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.04) }
                  }}
                  onClick={() => handleApplyNatTemplate(tpl)}
                >
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                      <Label variant="soft" color={tpl.chain === 'dstnat' ? 'warning' : 'primary'}>
                        {tpl.chain}
                      </Label>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {tpl.title}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', mb: 1.5 }}>
                      {tpl.description}
                    </Typography>
                  </Box>
                  <Button size="small" variant="contained" color="primary" sx={{ alignSelf: 'flex-start', fontWeight: 700 }}>
                    Sử dụng mẫu này
                  </Button>
                </Card>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setNatTemplateDialogOpen(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>

      {/* Custom NAT Rule Dialog */}
      <Dialog open={natFormDialogOpen} onClose={() => setNatFormDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSaveNatRule}>
          <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Shield size={20} color={theme.palette.primary.main} /> Cấu Hình Quy Tắc NAT / Port Forwarding
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Chain</InputLabel>
                    <Select
                      value={natForm.chain}
                      label="Chain"
                      onChange={(e) => setNatForm(prev => ({ ...prev, chain: e.target.value }))}
                    >
                      <MenuItem value="dstnat">dstnat (Chuyển tiếp cổng)</MenuItem>
                      <MenuItem value="srcnat">srcnat (Masquerade / Loopback)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Action</InputLabel>
                    <Select
                      value={natForm.action}
                      label="Action"
                      onChange={(e) => setNatForm(prev => ({ ...prev, action: e.target.value }))}
                    >
                      <MenuItem value="dst-nat">dst-nat</MenuItem>
                      <MenuItem value="masquerade">masquerade</MenuItem>
                      <MenuItem value="src-nat">src-nat</MenuItem>
                      <MenuItem value="redirect">redirect</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              {natForm.chain === 'dstnat' && (
                <>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Giao thức (Protocol)</InputLabel>
                        <Select
                          value={natForm.protocol}
                          label="Giao thức (Protocol)"
                          onChange={(e) => setNatForm(prev => ({ ...prev, protocol: e.target.value }))}
                        >
                          <MenuItem value="tcp">TCP</MenuItem>
                          <MenuItem value="udp">UDP</MenuItem>
                          <MenuItem value="all">Tất cả</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        size="small"
                        label="Cổng đến ngoài WAN (Dst. Port)"
                        value={natForm.dstPort}
                        onChange={(e) => setNatForm(prev => ({ ...prev, dstPort: e.target.value }))}
                        placeholder="VD: 80, 443, 3389"
                        fullWidth
                      />
                    </Grid>
                  </Grid>

                  <Grid container spacing={2}>
                    <Grid item xs={7}>
                      <TextField
                        size="small"
                        label="IP đích trong LAN (To Addresses)"
                        value={natForm.toAddresses}
                        onChange={(e) => setNatForm(prev => ({ ...prev, toAddresses: e.target.value }))}
                        placeholder="VD: 192.168.1.50"
                        required
                        fullWidth
                      />
                    </Grid>
                    <Grid item xs={5}>
                      <TextField
                        size="small"
                        label="Cổng đích LAN (To Ports)"
                        value={natForm.toPorts}
                        onChange={(e) => setNatForm(prev => ({ ...prev, toPorts: e.target.value }))}
                        placeholder="VD: 8080"
                        fullWidth
                      />
                    </Grid>
                  </Grid>
                </>
              )}

              {natForm.chain === 'srcnat' && (
                <TextField
                  size="small"
                  label="Cổng mạng xuất (Out Interface)"
                  value={natForm.outInterface}
                  onChange={(e) => setNatForm(prev => ({ ...prev, outInterface: e.target.value }))}
                  placeholder="VD: pppoe-out1 hoặc ether1"
                  helperText="Để trống nếu muốn áp dụng cho toàn bộ interfaces"
                  fullWidth
                />
              )}

              <TextField
                size="small"
                label="Ghi chú / Comment"
                value={natForm.comment}
                onChange={(e) => setNatForm(prev => ({ ...prev, comment: e.target.value }))}
                placeholder="VD: Forward Web Server, RDP Desktop..."
                fullWidth
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2.5 }}>
            <Button onClick={() => setNatFormDialogOpen(false)}>Hủy</Button>
            <Button type="submit" variant="contained" color="primary" sx={{ fontWeight: 700 }}>
              Áp dụng quy tắc
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete NAT Rule Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(confirmDeleteNatId)}
        title="Xóa quy tắc NAT / Firewall?"
        message="Bạn có chắc muốn xóa quy tắc chuyển tiếp cổng NAT này khỏi MikroTik RouterOS?"
        onConfirm={() => handleDeleteNatRule(confirmDeleteNatId)}
        onClose={() => setConfirmDeleteNatId(null)}
      />

      {/* SuperAdmin Managed Device Add/Edit Dialog */}
      <NetworkDeviceDialog
        open={deviceDialogOpen}
        onClose={() => setDeviceDialogOpen(false)}
        onSave={handleSaveDevice}
        editingDevice={editingDevice}
        defaultRole={deviceDefaultRole}
      />

      {/* Delete Managed Device Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(confirmDeleteDeviceId)}
        title="Xóa thiết bị mạng khỏi hệ thống?"
        message="Bạn có chắc muốn xóa thiết bị này khỏi danh sách quản lý và giám sát tập trung?"
        onConfirm={() => handleDeleteDevice(confirmDeleteDeviceId)}
        onClose={() => setConfirmDeleteDeviceId(null)}
      />
    </Box>
  );
}
