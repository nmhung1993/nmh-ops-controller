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
  { value: '1h', key: 'dashboard.range1h' },
  { value: '8h', key: 'dashboard.range8h' },
  { value: '24h', key: 'dashboard.range24h' },
  { value: '7d', key: 'dashboard.range7d' }
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
      { name: 'Độ trễ Max', type: 'area', data: latencySeriesData },
      { name: 'Độ trễ Min', type: 'line', data: minLatencySeriesData },
      { name: 'Spike (>100ms)', type: 'line', data: spikeSeriesData },
      { name: 'Drop Timeout', type: 'column', data: dropSeriesData }
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
      legend: {
        show: true,
        position: 'top',
        horizontalAlign: 'center',
        fontSize: '11px',
        fontWeight: 600,
        markers: { width: 8, height: 8, radius: 12 },
        itemMargin: { horizontal: 6, vertical: 2 }
      },
      stroke: { curve: ['smooth', 'smooth', 'straight', 'straight'], width: [2, 1.5, 2.5, 2] },
      markers: {
        size: [0, 0, 3, 4],
        colors: [theme.palette.primary.main, theme.palette.info.main, theme.palette.warning.main, theme.palette.error.main],
        strokeColors: '#fff',
        strokeWidth: 2,
        hover: { size: 6 }
      },
      fill: {
        type: ['gradient', 'solid', 'solid', 'solid'],
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.4,
          opacityTo: 0.05,
          stops: [0, 95, 100]
        }
      },
      xaxis: {
        categories: chartTimestamps,
        labels: { rotate: -30, rotateAlways: chartTimestamps.length > 15, style: { fontSize: '10px' } }
      },
      yaxis: {
        min: 0,
        labels: { formatter: (v) => `${Math.round(v)} ms`, style: { fontSize: '10px' } }
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
            {t('network.title')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('network.subtitle')}
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
            {t('network.exportData')}
          </Button>

          <Menu
            anchorEl={exportAnchorEl}
            open={Boolean(exportAnchorEl)}
            onClose={() => setExportAnchorEl(null)}
            PaperProps={{ sx: { minWidth: 200, borderRadius: 2 } }}
          >
            <Typography variant="overline" sx={{ px: 2, py: 0.5, color: 'text.secondary', fontWeight: 800, display: 'block' }}>
              {t('network.exportRange')}
            </Typography>
            <MenuItem onClick={() => handleExportData('1h', 'csv')}>
              <FileSpreadsheet size={16} style={{ marginRight: 8 }} /> {t('network.last1h')}
            </MenuItem>
            <MenuItem onClick={() => handleExportData('8h', 'csv')}>
              <FileSpreadsheet size={16} style={{ marginRight: 8 }} /> {t('network.last8h')}
            </MenuItem>
            <MenuItem onClick={() => handleExportData('24h', 'csv')}>
              <FileSpreadsheet size={16} style={{ marginRight: 8 }} /> {t('network.last24h')}
            </MenuItem>
            <MenuItem onClick={() => handleExportData('7d', 'csv')}>
              <FileSpreadsheet size={16} style={{ marginRight: 8 }} /> {t('network.last7d')}
            </MenuItem>
            <MenuItem onClick={() => handleExportData('30d', 'csv')}>
              <FileSpreadsheet size={16} style={{ marginRight: 8 }} /> {t('network.last30d')}
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => handleExportData('24h', 'json')}>
              <FileCode size={16} style={{ marginRight: 8 }} /> {t('network.full24hJson')}
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
              {t('network.addTarget')}
            </Button>
          )}
        </Stack>
      </Stack>

      {/* Consolidated Network Hero Metrics Bar (2x2 on Mobile, 4x1 on Desktop) */}
      <Card sx={{ borderRadius: 2.5, mb: 2, p: { xs: 1.25, sm: 2 }, bgcolor: alpha(theme.palette.background.paper, 0.8), backdropFilter: 'blur(8px)', border: `1px solid ${theme.palette.divider}` }}>
        <Grid container spacing={{ xs: 1, sm: 2 }} alignItems="center">
          {/* Total Targets */}
          <Grid item xs={6} sm={6} md={3}>
            <Stack direction="row" spacing={{ xs: 1, sm: 1.75 }} alignItems="center">
              <Box sx={{ p: { xs: 0.75, sm: 1.25 }, borderRadius: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main', display: 'flex', flexShrink: 0 }}>
                <Globe size={18} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.625rem', display: 'block', noWrap: true }}>
                  {t('network.totalTargets')}
                </Typography>
                <Stack direction="row" spacing={0.5} alignItems="baseline" sx={{ flexWrap: 'wrap' }}>
                  <Typography variant="h6" sx={{ fontWeight: 800, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                    {summary.total}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                    {summary.paused > 0 ? t('network.pausedCount', { count: summary.paused }) : 'Ping'}
                  </Typography>
                </Stack>
              </Box>
            </Stack>
          </Grid>

          {/* Online / Stable */}
          <Grid item xs={6} sm={6} md={3}>
            <Stack direction="row" spacing={{ xs: 1, sm: 1.75 }} alignItems="center">
              <Box sx={{ p: { xs: 0.75, sm: 1.25 }, borderRadius: 1.5, bgcolor: alpha(theme.palette.success.main, 0.12), color: 'success.main', display: 'flex', flexShrink: 0 }}>
                <CheckCircle2 size={18} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.625rem', display: 'block', noWrap: true }}>
                  {t('network.online')}
                </Typography>
                <Stack direction="row" spacing={0.5} alignItems="baseline" sx={{ flexWrap: 'wrap' }}>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: 'success.main', fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                    {summary.online}
                  </Typography>
                  <Chip label={t('network.good')} size="small" color="success" sx={{ height: 16, fontSize: 9, fontWeight: 700, px: 0.25 }} />
                </Stack>
              </Box>
            </Stack>
          </Grid>

          {/* Degraded / Offline */}
          <Grid item xs={6} sm={6} md={3}>
            <Stack direction="row" spacing={{ xs: 1, sm: 1.75 }} alignItems="center">
              <Box sx={{ p: { xs: 0.75, sm: 1.25 }, borderRadius: 1.5, bgcolor: alpha(theme.palette.error.main, 0.12), color: 'error.main', display: 'flex', flexShrink: 0 }}>
                <AlertTriangle size={18} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.625rem', display: 'block', noWrap: true }}>
                  {t('network.offline')}
                </Typography>
                <Stack direction="row" spacing={0.5} alignItems="baseline" sx={{ flexWrap: 'wrap' }}>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: summary.offline > 0 ? 'error.main' : 'text.primary', fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                    {summary.degraded + summary.offline}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                    {summary.offline} off
                  </Typography>
                </Stack>
              </Box>
            </Stack>
          </Grid>

          {/* WAN IP & Gateway */}
          <Grid item xs={6} sm={6} md={3}>
            <Stack direction="row" spacing={{ xs: 1, sm: 1.75 }} alignItems="center">
              <Box sx={{ p: { xs: 0.75, sm: 1.25 }, borderRadius: 1.5, bgcolor: alpha(theme.palette.info.main, 0.12), color: 'info.main', display: 'flex', flexShrink: 0 }}>
                <RouterIcon size={18} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.625rem', display: 'block', noWrap: true }}>
                  WAN & Gateway
                </Typography>
                <Typography variant="body2" noWrap sx={{ fontWeight: 800, color: 'primary.main', fontFamily: 'monospace', fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                  {wanIp}
                </Typography>
                <Typography variant="caption" noWrap sx={{ color: 'text.secondary', display: 'block', fontSize: '0.65rem' }}>
                  GW: {gatewayStr}
                </Typography>
              </Box>
            </Stack>
          </Grid>
        </Grid>
      </Card>

      {/* Tabs Selector */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2.5 }}>
        <Tabs value={currentTab} onChange={(_, v) => setCurrentTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
          <Tab icon={<Globe size={16} />} iconPosition="start" label={t('network.tab.ping')} sx={{ fontWeight: 700, minHeight: 44, py: 0.5, fontSize: { xs: '0.78rem', sm: '0.875rem' } }} />
          {isSuperAdmin && <Tab icon={<Search size={16} />} iconPosition="start" label={t('network.tab.scanner')} sx={{ fontWeight: 700, minHeight: 44, py: 0.5, fontSize: { xs: '0.78rem', sm: '0.875rem' } }} />}
          {isSuperAdmin && <Tab icon={<Shield size={16} />} iconPosition="start" label={t('network.tab.gateway')} sx={{ fontWeight: 700, minHeight: 44, py: 0.5, fontSize: { xs: '0.78rem', sm: '0.875rem' } }} />}
          {isSuperAdmin && <Tab icon={<Wifi size={16} />} iconPosition="start" label={t('network.tab.wifiMesh')} sx={{ fontWeight: 700, minHeight: 44, py: 0.5, fontSize: { xs: '0.78rem', sm: '0.875rem' } }} />}
        </Tabs>
      </Box>

      {/* Action Notification Message if any */}
      {actionMessage && (
        <Alert
          severity={typeof actionMessage === 'object' ? (actionMessage?.type || 'info') : 'success'}
          sx={{ mb: 2, borderRadius: 2 }}
          onClose={() => setActionMessage(null)}
        >
          {typeof actionMessage === 'object' ? (actionMessage?.text || '') : actionMessage}
        </Alert>
      )}

      {/* ==================================================== */}
      {/* TAB 0: PING MONITOR & PING TRENDS CHART */}
      {/* ==================================================== */}
      <Box sx={{ display: currentTab === 0 ? 'block' : 'none' }}>
        <Stack spacing={2}>
          {/* Biểu đồ biến động Ping & Drop Packet */}
          <Card sx={{ p: { xs: 1.5, sm: 2.5 }, borderRadius: 2.5 }}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              alignItems={{ xs: 'flex-start', md: 'center' }}
              justifyContent="space-between"
              spacing={1.5}
              sx={{ mb: 1.5 }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1, fontSize: { xs: '0.9rem', sm: '1.05rem' } }}>
                  <TrendingUp size={18} color={theme.palette.primary.main} /> {t('network.trendsTitle')}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' }, fontSize: '0.75rem' }}>
                  {t('network.trendsSubtitle')}
                </Typography>
              </Box>

              <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.75, width: { xs: '100%', md: 'auto' }, justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
                {/* Target Selector Dropdown */}
                <FormControl size="small" sx={{ minWidth: { xs: 130, sm: 160 } }}>
                  <Select
                    value={chartTargetId}
                    onChange={(e) => setChartTargetId(e.target.value)}
                    sx={{ height: 32, fontSize: '0.75rem', borderRadius: 1.5 }}
                  >
                    <MenuItem value="all">{t('network.allTargets')}</MenuItem>
                    {targets.map((t) => (
                      <MenuItem key={t.id} value={t.id}>
                        {t.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {/* Range Selector Buttons */}
                <Stack direction="row" spacing={0.5} sx={{ overflowX: 'auto', pb: { xs: 0.5, sm: 0 } }}>
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
                          py: 0.25,
                          px: 1,
                          height: 32,
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          borderRadius: 1.5,
                          minWidth: 'auto',
                          bgcolor: active ? undefined : alpha(theme.palette.grey[500], 0.06)
                        }}
                      >
                        {t(r.key)}
                      </Button>
                    );
                  })}
                </Stack>
              </Stack>
            </Stack>

            {/* Spike & Drop Indicators Strip (2x2 on Mobile, 4x1 on Desktop) */}
            <Grid container spacing={{ xs: 1, sm: 2 }} sx={{ mb: 1.5 }} justifyContent="center">
              <Grid item xs={6} sm={6} md={3}>
                <Card variant="outlined" sx={{ p: { xs: 1, sm: 1.5 }, display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 }, borderRadius: 2, borderColor: totalDrops > 0 ? 'error.main' : 'divider' }}>
                  <Box sx={{ color: totalDrops > 0 ? 'error.main' : 'success.main', display: 'flex', flexShrink: 0 }}>
                    <AlertOctagon size={18} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: { xs: '0.58rem', sm: '0.6875rem' }, display: 'block', noWrap: true }}>
                      {t('network.dropTimeout')}
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: totalDrops > 0 ? 'error.main' : 'success.main', fontSize: { xs: '0.85rem', sm: '1rem' } }} noWrap>
                      {totalDrops} {t('network.pktsUnit')} ({chartMetrics.length > 0 ? ((totalDrops / chartMetrics.length) * 100).toFixed(0) : 0}%)
                    </Typography>
                  </Box>
                </Card>
              </Grid>

              <Grid item xs={6} sm={6} md={3}>
                <Card variant="outlined" sx={{ p: { xs: 1, sm: 1.5 }, display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 }, borderRadius: 2, borderColor: totalSpikes > 0 ? 'warning.main' : 'divider' }}>
                  <Box sx={{ color: maxSpike > 100 ? 'warning.main' : 'primary.main', display: 'flex', flexShrink: 0 }}>
                    <Activity size={18} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: { xs: '0.58rem', sm: '0.6875rem' }, display: 'block', noWrap: true }}>
                      {t('network.maxSpike')}
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: maxSpike > 100 ? 'warning.main' : 'text.primary', fontSize: { xs: '0.85rem', sm: '1rem' } }} noWrap>
                      {maxSpike} ms {totalSpikes > 0 && <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>({totalSpikes})</span>}
                    </Typography>
                  </Box>
                </Card>
              </Grid>

              <Grid item xs={6} sm={6} md={3}>
                <Card variant="outlined" sx={{ p: { xs: 1, sm: 1.5 }, display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 }, borderRadius: 2 }}>
                  <Box sx={{ color: 'primary.main', display: 'flex', flexShrink: 0 }}>
                    <Clock size={18} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: { xs: '0.58rem', sm: '0.6875rem' }, display: 'block', noWrap: true }}>
                      {t('network.avgLatency')}
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'primary.main', fontSize: { xs: '0.85rem', sm: '1rem' } }} noWrap>
                      {avgLatency} ms
                    </Typography>
                  </Box>
                </Card>
              </Grid>

              <Grid item xs={6} sm={6} md={3}>
                <Card variant="outlined" sx={{ p: { xs: 1, sm: 1.5 }, display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 }, borderRadius: 2 }}>
                  <Box sx={{ color: 'info.main', display: 'flex', flexShrink: 0 }}>
                    <TrendingUp size={18} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: { xs: '0.58rem', sm: '0.6875rem' }, display: 'block', noWrap: true }}>
                      {t('network.jitter')}
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: { xs: '0.85rem', sm: '1rem' } }} noWrap>
                      ±{jitterVal} ms
                    </Typography>
                  </Box>
                </Card>
              </Grid>
            </Grid>

            {/* Chart Render */}
            <Box sx={{ pt: 0.5, minHeight: 240 }}>
              {loadingChart && <LinearProgress sx={{ mb: 1, borderRadius: 1 }} />}
              <Chart
                key={`ping_chart_${currentTab}_${chartTargetId}_${chartRange}_${chartMetrics.length}`}
                type="area"
                series={chartSeries}
                options={pingChartOptions}
                height={240}
              />
            </Box>
          </Card>

          {/* Tag Filter Pills */}
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, justifyContent: { xs: 'center', sm: 'flex-start' } }}>
            {tagsList.map((tag) => (
              <Button
                key={tag}
                size="small"
                variant={tagFilter === tag ? 'contained' : 'outlined'}
                color={tagFilter === tag ? 'primary' : 'inherit'}
                onClick={() => setTagFilter(tag)}
                sx={{ borderRadius: 1.5, fontWeight: 700, fontSize: '0.75rem' }}
              >
                {tag === 'all' ? t('network.allCount', { count: targets.length }) : tag}
              </Button>
            ))}
          </Stack>

          {/* Targets Grid */}
          <Grid container spacing={{ xs: 1.5, sm: 2.5 }} justifyContent="center">
            {filteredTargets.map((target) => {
              const isPaused = !target.enabled;
              const isOnline = target.enabled && target.status === 'online';
              const isDegraded = target.enabled && target.status === 'degraded';
              const statusColor = isPaused ? 'default' : isOnline ? 'success' : isDegraded ? 'warning' : 'error';
              const statusLabel = isPaused ? t('network.statusPaused') : isOnline ? t('network.statusOnline') : isDegraded ? t('network.statusDegraded') : t('network.statusOffline');

              return (
                <Grid item xs={12} sm={6} lg={4} key={target.id}>
                  <Card
                    sx={{
                      p: { xs: 1.5, sm: 2.25 },
                      height: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      overflow: 'hidden',
                      borderRadius: 2.5,
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
                      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
                        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                          <Typography variant="subtitle2" noWrap sx={{ fontWeight: 800, fontSize: { xs: '0.875rem', sm: '0.95rem' } }}>
                            {target.name}
                          </Typography>
                          <Typography variant="caption" noWrap sx={{ color: 'text.secondary', display: 'block', fontFamily: 'monospace', fontWeight: 600, fontSize: '0.7rem' }}>
                            {target.host} • {target.tag || 'Device'} • {Math.round((target.interval || 3000) / 1000)}s
                          </Typography>
                        </Box>

                        <Label
                          variant="soft"
                          color={statusColor}
                          startIcon={isPaused ? <Pause size={10} /> : isOnline ? <CheckCircle2 size={10} /> : isDegraded ? <AlertTriangle size={10} /> : <XCircle size={10} />}
                          sx={{ flexShrink: 0, height: 22, fontSize: '0.7rem' }}
                        >
                          {statusLabel}
                        </Label>
                      </Stack>

                      {/* Latency & Packet Loss Metrics */}
                      <Stack direction="row" spacing={1.5} justifyContent="center" textAlign="center" sx={{ my: { xs: 1, sm: 1.5 }, p: { xs: 1, sm: 1.25 }, borderRadius: 2, bgcolor: alpha(theme.palette.grey[500], 0.06) }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.65rem' }}>
                            {t('network.latencyPing')}
                          </Typography>
                          <Typography variant="h6" sx={{ fontWeight: 800, fontSize: { xs: '1.05rem', sm: '1.25rem' }, color: isPaused ? 'text.disabled' : `${statusColor}.main` }}>
                            {!isPaused && target.latency !== null ? `${target.latency} ms` : '--'}
                          </Typography>
                        </Box>
                        <Divider orientation="vertical" flexItem />
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.65rem' }}>
                            {t('network.packetLoss')}
                          </Typography>
                          <Typography variant="h6" sx={{ fontWeight: 800, fontSize: { xs: '1.05rem', sm: '1.25rem' }, color: target.packetLoss > 10 ? 'error.main' : 'text.primary' }}>
                            {!isPaused ? `${target.packetLoss}%` : '--'}
                          </Typography>
                        </Box>
                      </Stack>

                      {/* Recent History Dots */}
                      <Box sx={{ mb: 1 }}>
                        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent={{ xs: 'center', sm: 'flex-start' }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', mr: 0.5 }}>
                            {t('network.historyLabel')}
                          </Typography>
                          {(target.history || []).slice(-12).map((h, i) => (
                            <Tooltip key={i} title={`${h.time.split('T')[1].slice(0, 8)}: ${h.latency !== null ? `${h.latency}ms` : 'Timeout'}`}>
                              <Box
                                sx={{
                                  width: 7,
                                  height: 14,
                                  borderRadius: 0.75,
                                  bgcolor: h.status === 'online' ? 'success.main' : h.status === 'degraded' ? 'warning.main' : 'error.main'
                                }}
                              />
                            </Tooltip>
                          ))}
                        </Stack>
                      </Box>
                    </Box>

                    {/* Footer Actions */}
                    <Box sx={{ pt: 1, borderTop: `1px solid ${theme.palette.divider}` }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.7rem' }}>
                          <Clock size={11} /> {target.lastCheck ? target.lastCheck.split('T')[1].slice(0, 8) : '--'}
                        </Typography>

                        <Stack direction="row" spacing={0.5}>
                          {/* Pause / Resume Button (Super Admin) */}
                          {isSuperAdmin && (
                            <IconButton
                              size="small"
                              color={target.enabled ? 'warning' : 'success'}
                              onClick={(e) => handleToggleTargetEnabled(target, e)}
                              title={target.enabled ? t('network.pausePing') || 'Tạm dừng ping' : t('network.resumePing') || 'Tiếp tục ping'}
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
                              title={t('common.edit')}
                            >
                              <Edit2 size={14} />
                            </IconButton>
                          )}

                          {/* Instant Ping Button */}
                          <IconButton
                            size="small"
                            onClick={(e) => handlePingNow(target.id, e)}
                            title={t('network.pingNow') || 'Ping ngay'}
                          >
                            <RotateCcw size={14} />
                          </IconButton>

                          {/* Delete Button (Super Admin) */}
                          {isSuperAdmin && (
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setConfirmDeleteId(target.id)}
                              title={t('common.delete')}
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
                label={t('network.subnetLabel')}
                value={scanSubnet}
                onChange={(e) => setScanSubnet(e.target.value)}
                size="small"
                sx={{ width: { xs: 1, sm: 300 } }}
              />
              {scanState.isScanning ? (
                <Button variant="contained" color="error" startIcon={<RotateCcw size={16} />} onClick={handleStopScan}>
                  {t('network.stopScan', { current: scanState.current, total: scanState.total })}
                </Button>
              ) : (
                <Button variant="contained" color="primary" startIcon={<Play size={16} />} onClick={handleStartScan}>
                  {t('network.startScan')}
                </Button>
              )}
            </Stack>

            {scanState.isScanning && (
              <Box sx={{ mb: 3 }}>
                <LinearProgress variant="determinate" value={(scanState.current / scanState.total) * 100} sx={{ height: 8, borderRadius: 4 }} />
                <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                  {t('network.scanning')} {scanState.current} / {scanState.total} ({Math.round((scanState.current / scanState.total) * 100)}%)
                </Typography>
              </Box>
            )}

            <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
              {t('network.currentScanResults', { count: scanState.results?.length || 0 })}
            </Typography>

            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>{t('network.ipAddress')}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{t('network.deviceNameEditable')}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{t('network.macAddress')}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{t('network.latency')}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{t('common.status')}</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>{t('common.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!scanState.results || scanState.results.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                        {t('network.noDevicesScanned')}
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
                                  {t('network.originalName', { name: item.autoName })}
                                </Typography>
                              )}
                            </Box>
                            <Tooltip title={t('network.renameTooltip')}>
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
                            Online
                          </Label>
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right' }}>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<Plus size={14} />}
                            onClick={() => handleOpenAddTarget(item.ip, item.hostname || `Device (${item.ip})`)}
                          >
                            {t('network.monitorBtn')}
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
              <History size={20} color={theme.palette.primary.main} /> {t('network.scanHistoryTitle')}
            </Typography>

            {scanHistoryList.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('network.noScanHistory')}
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
                          <Tooltip title={session.isPinned ? t('network.unpinTooltip') : t('network.pinTooltip')}>
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
                              {t('network.pinned')}
                            </Label>
                          )}

                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {session.subnet}
                          </Typography>
                          <Label variant="soft" color="primary">
                            {t('network.devicesCount', { count: session.totalDiscovered })}
                          </Label>
                        </Stack>

                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {session.scannedAt ? new Date(session.scannedAt).toLocaleString() : '--'}
                          </Typography>
                          <Tooltip title={t('network.deleteScanTooltip')}>
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
                              <TableCell sx={{ fontWeight: 700 }}>{t('network.deviceNameEditable')}</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>MAC</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>Latency</TableCell>
                              <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>{t('common.actions')}</TableCell>
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
                                          {t('network.originalName', { name: res.autoName })}
                                        </Typography>
                                      )}
                                    </Box>
                                    <Tooltip title={t('network.renameTooltip')}>
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
                                        {wolLoadingMac === res.mac ? t('network.wolSending') : t('network.wolBtn')}
                                      </Button>
                                    )}
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="inherit"
                                      startIcon={<SlidersHorizontal size={14} />}
                                      onClick={() => handleOpenAddQueue(res.ip, res.hostname)}
                                    >
                                      {t('network.limitBtn')}
                                    </Button>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="info"
                                      startIcon={<ArrowUpDown size={14} />}
                                      onClick={() => handleOpenAddNat(res.ip, res.hostname)}
                                    >
                                      {t('network.openPortBtn')}
                                    </Button>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      startIcon={<Plus size={14} />}
                                      onClick={() => handleOpenAddTarget(res.ip, res.hostname || `Device (${res.ip})`)}
                                    >
                                      {t('network.monitorBtn')}
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
            alignItems="center"
            justifyContent={{ xs: 'center', md: 'space-between' }}
            spacing={1.5}
            sx={{ flexWrap: 'wrap', gap: 1 }}
          >
            {/* Dynamic Gateway Device Switchers */}
            <Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: 'center', md: 'flex-start' }} sx={{ flexWrap: 'wrap', gap: 1, width: { xs: '100%', md: 'auto' } }}>
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
                    sx={{ fontWeight: 700, borderRadius: 2, fontSize: { xs: '0.75rem', sm: '0.875rem' }, py: 0.5 }}
                  >
                    {gw.name} ({gw.host})
                  </Button>
                );
              })}
            </Stack>

            {/* SuperAdmin CRUD */}
            {isSuperAdmin && (
              <Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: 'center', md: 'flex-end' }} sx={{ width: { xs: '100%', md: 'auto' } }}>
                {currentGatewayDevice && (
                  <Tooltip title={t('network.editGatewayTooltip')}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="inherit"
                      startIcon={<Edit2 size={14} />}
                      onClick={() => handleOpenEditDevice(currentGatewayDevice)}
                      sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                    >
                      {t('common.edit')}
                    </Button>
                  </Tooltip>
                )}

                {currentGatewayDevice && (
                  <Tooltip title={t('network.removeGatewayTooltip')}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<Trash2 size={14} />}
                      onClick={() => setConfirmDeleteDeviceId(currentGatewayDevice.id)}
                      sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                    >
                      {t('common.delete')}
                    </Button>
                  </Tooltip>
                )}

                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  startIcon={<Plus size={14} />}
                  onClick={() => handleOpenAddDevice('gateway')}
                  sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                >
                  {t('network.addGateway')}
                </Button>
              </Stack>
            )}
          </Stack>

          {/* Empty State when no Gateways configured */}
          {managedGateways.length === 0 && (
            <Card sx={{ p: { xs: 3, sm: 5 }, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
              <Box sx={{ color: 'text.secondary', display: 'flex', justifyContent: 'center', mb: 2 }}>
                <Shield size={48} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
                {t('network.noGatewayTitle')}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, maxWidth: 500, mx: 'auto', fontSize: '0.8125rem' }}>
                {t('network.noGatewayDesc')}
              </Typography>
              {isSuperAdmin && (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<Plus size={16} />}
                  onClick={() => handleOpenAddDevice('gateway')}
                  sx={{ fontWeight: 700 }}
                >
                  {t('network.addGatewayNow')}
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
                  {t('network.cannotConnectMikrotik', { host: mikrotikHost })}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                  {t('network.verifyMikrotikHint')}
                </Typography>
                <Button variant="contained" startIcon={<Settings size={16} />} onClick={handleOpenMikrotikConfig}>
                  {t('network.configureMikrotik')}
                </Button>
              </Card>
            ) : (
              <Stack spacing={2}>
                {/* MikroTik Banner */}
                <Card sx={{ p: { xs: 1.5, sm: 2.5 }, background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${theme.palette.background.paper} 100%)`, borderRadius: 2.5 }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center" justifyContent="space-between" spacing={2} sx={{ textAlign: { xs: 'center', md: 'left' } }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center" sx={{ width: { xs: '100%', md: 'auto' } }}>
                      <Box sx={{ width: { xs: 44, sm: 52 }, height: { xs: 44, sm: 52 }, borderRadius: 2, bgcolor: 'primary.main', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Shield size={26} />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" justifyContent={{ xs: 'center', sm: 'flex-start' }} sx={{ flexWrap: 'wrap', gap: 0.5, mb: 0.25 }}>
                          <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: 0.5, fontSize: '0.65rem', lineHeight: 1.2 }}>
                            MIKROTIK CORE ROUTER
                          </Typography>
                          <Label variant="soft" color={mikrotikStatus.online ? 'success' : 'error'} sx={{ height: 20, fontSize: '0.65rem' }}>
                            {mikrotikStatus.online ? 'Online' : 'Offline'}
                          </Label>
                          {mikrotikStatus.isApiConnected && (
                            <Label variant="soft" color="info" sx={{ height: 20, fontSize: '0.65rem' }}>API Connected</Label>
                          )}
                        </Stack>
                        <Typography variant="h6" sx={{ fontWeight: 800, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                          {mikrotikStatus.routerName}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', fontSize: '0.72rem' }}>
                          Host: {mikrotikStatus.host} • Model: {mikrotikStatus.hardware} • OS: {mikrotikStatus.version} • Uptime: {mikrotikStatus.uptimeFormatted}
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.75, justifyContent: { xs: 'center', md: 'flex-end' }, width: { xs: '100%', md: 'auto' } }}>
                      <Button
                        size="small"
                        variant="outlined"
                        color="warning"
                        startIcon={<RefreshCw size={14} />}
                        onClick={() => setConfirmReconnectPppoeOpen(true)}
                        sx={{ fontWeight: 700, fontSize: '0.75rem', py: 0.5 }}
                      >
                        {t('network.renewIp')}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<Power size={14} />}
                        onClick={() => setConfirmMikrotikRebootOpen(true)}
                        sx={{ fontWeight: 700, fontSize: '0.75rem', py: 0.5 }}
                      >
                        Reboot
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        color="inherit"
                        startIcon={<Settings size={14} />}
                        onClick={handleOpenMikrotikConfig}
                        sx={{ fontWeight: 700, fontSize: '0.75rem', py: 0.5 }}
                      >
                        {t('network.apiConfig')}
                      </Button>
                    </Stack>
                  </Stack>
                </Card>

                {/* MikroTik Telemetry & Bandwidth Cards (2x2 on Mobile) */}
                <Grid container spacing={{ xs: 1, sm: 2 }}>
                  {/* PPPoE WAN Status Card */}
                  <Grid item xs={6} sm={6} md={3}>
                    <Card sx={{ p: { xs: 1.25, sm: 2 }, height: '100%', borderRadius: 2 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: { xs: '0.6rem', sm: '0.7rem' } }}>
                          PUBLIC WAN
                        </Typography>
                        <Label variant="soft" color={mikrotikStatus.wan?.pppoeStatus === 'online' ? 'success' : 'warning'} sx={{ height: 18, fontSize: '0.625rem', px: 0.5 }}>
                          {mikrotikStatus.wan?.pppoeStatus === 'online' ? 'Connected' : 'Offline'}
                        </Label>
                      </Stack>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, my: 0.25, color: 'primary.main', fontFamily: 'monospace', fontSize: { xs: '0.875rem', sm: '1.1rem' } }} noWrap>
                        {mikrotikStatus.wan?.ip || '--'}
                      </Typography>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }} noWrap>
                          User: {showPppoeUser ? (mikrotikStatus.wan?.pppoeUser || '--') : (mikrotikStatus.wan?.pppoeUser ? '••••••••' : '--')}
                        </Typography>
                        {mikrotikStatus.wan?.pppoeUser && (
                          <Tooltip title={showPppoeUser ? t('network.hidePppoeAccount') : t('network.showPppoeAccount')}>
                            <IconButton
                              size="small"
                              onClick={() => setShowPppoeUser(v => !v)}
                              sx={{ p: 0.2, color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
                            >
                              {showPppoeUser ? <EyeOff size={11} /> : <Eye size={11} />}
                            </IconButton>
                          </Tooltip>
                        )}
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }} noWrap>
                          • {mikrotikStatus.wan?.interface}
                        </Typography>
                      </Stack>
                    </Card>
                  </Grid>

                  {/* Realtime Bandwidth Tx/Rx */}
                  <Grid item xs={6} sm={6} md={3}>
                    <Card sx={{ p: { xs: 1.25, sm: 2 }, height: '100%', borderRadius: 2 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: { xs: '0.6rem', sm: '0.7rem' } }}>
                        {t('network.pppoeBandwidth')}
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ my: 0.25 }}>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.25, fontSize: '0.65rem' }}>
                            <ArrowDown size={11} /> DL
                          </Typography>
                          <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: { xs: '0.8rem', sm: '0.95rem' } }} noWrap>
                            {mikrotikStatus.bandwidth?.rxMbps || 0} <span style={{ fontSize: '0.65rem', fontWeight: 500 }}>M</span>
                          </Typography>
                        </Box>
                        <Divider orientation="vertical" flexItem />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="caption" sx={{ color: 'info.main', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.25, fontSize: '0.65rem' }}>
                            <ArrowUp size={11} /> UL
                          </Typography>
                          <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: { xs: '0.8rem', sm: '0.95rem' } }} noWrap>
                            {mikrotikStatus.bandwidth?.txMbps || 0} <span style={{ fontSize: '0.65rem', fontWeight: 500 }}>M</span>
                          </Typography>
                        </Box>
                      </Stack>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', display: 'block' }}>
                        {t('network.realtime')}
                      </Typography>
                    </Card>
                  </Grid>

                  {/* CPU Load & Hardware */}
                  <Grid item xs={6} sm={6} md={3}>
                    <Card sx={{ p: { xs: 1.25, sm: 2 }, height: '100%', borderRadius: 2 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: { xs: '0.6rem', sm: '0.7rem' } }}>
                        {t('network.routerCpuLoad')}
                      </Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, my: 0.25, color: mikrotikStatus.cpu > 80 ? 'error.main' : 'text.primary', fontSize: { xs: '0.875rem', sm: '1.1rem' } }}>
                        {mikrotikStatus.cpu}%
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', display: 'block' }} noWrap>
                        {mikrotikStatus.cpuCount} Cores • {mikrotikStatus.cpuFrequency}MHz
                      </Typography>
                    </Card>
                  </Grid>

                  {/* Memory RAM */}
                  <Grid item xs={6} sm={6} md={3}>
                    <Card sx={{ p: { xs: 1.25, sm: 2 }, height: '100%', borderRadius: 2 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: { xs: '0.6rem', sm: '0.7rem' } }}>
                        {t('network.ramMemory')}
                      </Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, my: 0.25, fontSize: { xs: '0.875rem', sm: '1.1rem' } }}>
                        {mikrotikStatus.memory}%
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', display: 'block' }} noWrap>
                        {mikrotikStatus.memoryFreeMb}MB / {mikrotikStatus.memoryTotalMb}MB
                      </Typography>
                    </Card>
                  </Grid>
                </Grid>

                {/* Sub-Tabs: DHCP > NAT > Bandwidth Limit */}
                <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 1, overflowX: 'auto' }}>
                  <Tabs
                    value={mikrotikSubTab}
                    onChange={(_, val) => setMikrotikSubTab(val)}
                    variant="scrollable"
                    scrollButtons="auto"
                    allowScrollButtonsMobile
                    sx={{
                      '& .MuiTabs-scroller': { overflowX: 'auto !important' }
                    }}
                  >
                    <Tab
                      value="leases"
                      label={`DHCP (${mikrotikStatus.dhcpLeases?.length || 0})`}
                      icon={<Users size={16} />}
                      iconPosition="start"
                      sx={{ fontWeight: 700, minHeight: 40, py: 0.5, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                    />
                    <Tab
                      value="nat"
                      label={`NAT (${mikrotikNatRules.length})`}
                      icon={<ArrowUpDown size={16} />}
                      iconPosition="start"
                      sx={{ fontWeight: 700, minHeight: 40, py: 0.5, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                    />
                    <Tab
                      value="queues"
                      label={`Bandwidth Limit (${mikrotikQueues.length})`}
                      icon={<SlidersHorizontal size={16} />}
                      iconPosition="start"
                      sx={{ fontWeight: 700, minHeight: 40, py: 0.5, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                    />
                  </Tabs>
                </Box>

                {/* Sub-Tab 1: DHCP */}
                {mikrotikSubTab === 'leases' && (
                  <Card sx={{ p: { xs: 1.5, sm: 3 }, borderRadius: 2 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
                      <Typography variant="h6" sx={{ fontWeight: 800, fontSize: { xs: '0.95rem', sm: '1.15rem' } }}>
                        {t('network.dhcpLeasesTitle', { count: filteredLeases.length })}
                      </Typography>
                      <TextField
                        size="small"
                        placeholder={t('network.searchDhcpPlaceholder')}
                        value={leaseSearch}
                        onChange={(e) => setLeaseSearch(e.target.value)}
                        sx={{ minWidth: { xs: '100%', sm: 260 } }}
                      />
                    </Stack>

                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>{t('network.ipAddress')}</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>{t('network.hostnameCol')}</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>{t('network.macAddress')}</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>{t('network.status')}</TableCell>
                            <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>{t('network.actions')}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {filteredLeases.map((lease, idx) => (
                            <TableRow key={lease.id || idx} hover>
                              <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                                {lease.ip}
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  {lease.hostname || lease.comment || t('network.lanDevice')}
                                </Typography>
                                {lease.comment && lease.hostname && (
                                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                    {lease.comment}
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                {lease.mac}
                              </TableCell>
                              <TableCell>
                                <Label variant="soft" color={lease.status === 'bound' ? 'success' : 'default'}>
                                  {lease.status || 'Active'}
                                </Label>
                              </TableCell>
                              <TableCell sx={{ textAlign: 'right' }}>
                                <Stack direction="row" spacing={0.75} justifyContent="flex-end">
                                  {/* Wake-on-LAN Button */}
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="primary"
                                    startIcon={<Zap size={13} />}
                                    disabled={wolLoadingMac === lease.mac}
                                    onClick={() => handleSendWol(lease.mac, lease.hostname || lease.comment)}
                                    sx={{ py: 0.25, px: 1, fontSize: '0.72rem' }}
                                  >
                                    {wolLoadingMac === lease.mac ? t('network.sending') : t('network.wol')}
                                  </Button>
                                  {/* Fast Create Simple Queue Button */}
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="inherit"
                                    startIcon={<SlidersHorizontal size={13} />}
                                    onClick={() => {
                                      setQueueForm({
                                        id: '',
                                        name: `Limit-${lease.hostname || lease.ip}`,
                                        target: lease.ip,
                                        uploadLimit: '10M',
                                        downloadLimit: '20M',
                                        comment: `QoS cho ${lease.hostname || lease.ip}`
                                      });
                                      setQueueDialogOpen(true);
                                    }}
                                    sx={{ py: 0.25, px: 1, fontSize: '0.72rem' }}
                                  >
                                    {t('network.limit')}
                                  </Button>
                                  {/* Quick NAT Port Forward Button */}
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="info"
                                    startIcon={<ArrowUpDown size={13} />}
                                    onClick={() => handleOpenAddNat(lease.ip, lease.hostname || lease.comment)}
                                    sx={{ py: 0.25, px: 1, fontSize: '0.72rem' }}
                                  >
                                    {t('network.openPort')}
                                  </Button>
                                  {/* Monitor Target Button */}
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<Plus size={13} />}
                                    onClick={() => handleOpenAddTarget(lease.ip, lease.hostname || lease.comment || `DHCP (${lease.ip})`)}
                                    sx={{ py: 0.25, px: 1, fontSize: '0.72rem' }}
                                  >
                                    {t('network.monitor')}
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

                {/* Sub-Tab 2: NAT & Port Forwarding */}
                {mikrotikSubTab === 'nat' && (
                  <Card sx={{ p: { xs: 1.5, sm: 3 }, borderRadius: 2 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1, fontSize: { xs: '0.95rem', sm: '1.15rem' } }}>
                          <Shield size={20} color={theme.palette.primary.main} /> {t('network.natRulesTitle')}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          {t('network.natRulesSubtitle')}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                        <Button
                          size="small"
                          variant="contained"
                          color="primary"
                          startIcon={<Layers size={15} />}
                          onClick={handleOpenNatTemplates}
                          sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                        >
                          {t('network.natTemplatesBtn')}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="primary"
                          startIcon={<Plus size={15} />}
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
                          sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                        >
                          {t('network.addNat')}
                        </Button>
                        <Button size="small" variant="outlined" startIcon={<RefreshCw size={14} />} onClick={() => loadMikrotikNat(false)}>
                          {t('network.refresh')}
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
                              <TableCell sx={{ fontWeight: 700 }}>{t('network.protoPort')}</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>{t('network.forwardTo')}</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>{t('network.comment')}</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>{t('network.status')}</TableCell>
                              <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>{t('network.actions')}</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {mikrotikNatRules.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                                  {t('network.noNatRules')}
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
                                      <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                                        {rule.action}
                                      </Typography>
                                    </Stack>
                                  </TableCell>
                                  <TableCell sx={{ fontFamily: 'monospace' }}>
                                    <Chip
                                      size="small"
                                      label={`${(rule.protocol || 'tcp').toUpperCase()}:${rule.dstPort || '*'}`}
                                      color="info"
                                      variant="outlined"
                                      sx={{ fontWeight: 700 }}
                                    />
                                    {rule.inInterface && (
                                      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>
                                        in: {rule.inInterface}
                                      </Typography>
                                    )}
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
                  <Tooltip title={t('network.editRouterTooltip')}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="inherit"
                      startIcon={<Edit2 size={15} />}
                      onClick={() => handleOpenEditDevice(currentRouterMeshDevice)}
                      sx={{ fontWeight: 700 }}
                    >
                      {t('common.edit')}
                    </Button>
                  </Tooltip>
                )}

                {currentRouterMeshDevice && (
                  <Tooltip title={t('network.removeRouterTooltip')}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<Trash2 size={15} />}
                      onClick={() => setConfirmDeleteDeviceId(currentRouterMeshDevice.id)}
                      sx={{ fontWeight: 700 }}
                    >
                      {t('common.delete')}
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
                  {t('network.addRouterMesh')}
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
                {t('network.noRouterMeshTitle')}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, maxWidth: 500, mx: 'auto' }}>
                {t('network.noRouterMeshDesc')}
              </Typography>
              {isSuperAdmin && (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<Plus size={16} />}
                  onClick={() => handleOpenAddDevice('router_mesh')}
                  sx={{ fontWeight: 700 }}
                >
                  {t('network.addRouterMeshNow')}
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
                  {t('network.cannotConnectAp', { host: selectedRouterHost })}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                  {t('network.checkApCredentials')}
                </Typography>
                <Button variant="contained" startIcon={<Settings size={16} />} onClick={() => setRouterConfigOpen(true)}>
                  {t('network.configureRouterAp')}
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
                        {t('network.restartWifi')}
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
                        {t('network.config')}
                      </Button>
                    </Stack>
                  </Stack>
                </Card>

                {/* Wi-Fi & Load Metric Cards */}
                <Grid container spacing={2.5}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ p: 2.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        {t('network.totalWifiClients')}
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
                        {t('network.apCpuLoad')}
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
                        {t('network.secondaryMeshNodes')}
                      </Typography>
                      <Typography variant="h3" sx={{ fontWeight: 800, my: 0.5 }}>
                        {routerStatus.meshNodes?.length || 0}
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                        {t('network.autoIpSync')}
                      </Typography>
                    </Card>
                  </Grid>
                </Grid>

                {/* Secondary Mesh Nodes Management Section (if any) */}
                {routerStatus.meshNodes && routerStatus.meshNodes.length > 0 && (
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Layers size={20} color={theme.palette.primary.main} /> {t('network.secondaryMeshNodesTitle', { count: routerStatus.meshNodes.length })}
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
                                  IP: {node.ip || t('network.noIpAssigned')} • {node.hardware} (v{node.version})
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700, mt: 0.5, display: 'block' }}>
                                  {t('network.backhaul')} {node.backhaulLabel}
                                </Typography>
                              </Box>

                              <Label variant="soft" color={node.online ? 'success' : 'error'}>
                                {node.online ? t('common.online') : t('common.offline')}
                              </Label>
                            </Stack>

                            <Stack direction="row" spacing={2} sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.grey[500], 0.06), mb: 2 }}>
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                  {t('network.cpuLoad') || 'TẢI CPU'}
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
                                  {t('network.wifiClients') || 'THIẾT BỊ WI-FI'}
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
                    {t('network.connectedWifiClientsTitle', { count: routerStatus.clients?.length || 0 })}
                  </Typography>
                  <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>{t('network.deviceName')}</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>{t('network.ipAddress')}</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>{t('network.band')}</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>MAC Address</TableCell>
                          <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>{t('common.actions')}</TableCell>
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
                                  {wolLoadingMac === client.mac ? t('network.wolSending') : t('network.wolBtn')}
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="inherit"
                                  startIcon={<SlidersHorizontal size={14} />}
                                  onClick={() => handleOpenAddQueue(client.ip, client.name)}
                                >
                                  {t('network.limitBtn')}
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="info"
                                  startIcon={<ArrowUpDown size={14} />}
                                  onClick={() => handleOpenAddNat(client.ip, client.name)}
                                >
                                  {t('network.openPortBtn')}
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<Plus size={14} />}
                                  onClick={() => handleOpenAddTarget(client.ip, client.name)}
                                >
                                  {t('network.monitorBtn')}
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
            {editingTarget ? t('network.editTarget') : t('network.addTarget')}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              <TextField
                label={t('network.targetDisplayName')}
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                placeholder="e.g. Core Gateway, Server Node 2..."
                required
                fullWidth
              />
              <TextField
                label={t('network.targetHost')}
                value={targetHost}
                onChange={(e) => setTargetHost(e.target.value)}
                placeholder="192.168.1.1 / 8.8.8.8"
                required
                fullWidth
              />
              <TextField
                label={t('network.targetTag')}
                value={targetTag}
                onChange={(e) => setTargetTag(e.target.value)}
                placeholder="e.g. Router, Mesh, Server, Cloud..."
                fullWidth
              />
              <TextField
                label={t('network.targetIntervalSec')}
                type="number"
                inputProps={{ min: 1, max: 3600 }}
                value={targetIntervalSec}
                onChange={(e) => setTargetIntervalSec(Number(e.target.value))}
                helperText={t('network.targetIntervalHelper')}
                fullWidth
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2.5 }}>
            <Button onClick={() => setTargetDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="contained" color="primary" sx={{ fontWeight: 700 }}>
              {editingTarget ? t('network.saveTarget') : t('network.addTarget')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Router Config Dialog (Xiaomi / Gecoos) */}
      <Dialog open={routerConfigOpen} onClose={() => setRouterConfigOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleSaveRouterConfig}>
          <DialogTitle sx={{ fontWeight: 800 }}>{t('network.routerConfigTitle', { type: selectedRouterType.toUpperCase() })}</DialogTitle>
          <DialogContent>
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              <TextField
                label={t('network.apIpAddress')}
                value={routerHost}
                onChange={(e) => setRouterHost(e.target.value)}
                required
                fullWidth
              />
              <TextField
                label={t('network.adminPassword')}
                type="password"
                value={routerPassword}
                onChange={(e) => setRouterPassword(e.target.value)}
                required
                fullWidth
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2.5 }}>
            <Button onClick={() => setRouterConfigOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="contained" color="primary">
              {t('network.saveConfig')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* MikroTik Config Dialog */}
      <Dialog open={mikrotikConfigOpen} onClose={() => setMikrotikConfigOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleSaveMikrotikConfig}>
          <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Shield size={22} color={theme.palette.primary.main} /> {t('network.mikrotikConfigTitle')}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Alert severity="info" sx={{ py: 0.5, fontSize: '0.78rem' }}>
                {t('network.mikrotikApiAlert')}
              </Alert>

              <TextField
                label={t('network.mikrotikIpAddress')}
                value={mikrotikHost}
                onChange={(e) => setMikrotikHost(e.target.value)}
                placeholder="192.168.1.1"
                required
                fullWidth
              />

              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, mb: 1, display: 'block' }}>
                  {t('network.servicePortPresets')}
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
                label={t('network.servicePort')}
                type="number"
                value={mikrotikPort}
                onChange={(e) => setMikrotikPort(e.target.value)}
                placeholder="8728 / 8729"
                required
                fullWidth
              />
              <TextField
                label={t('network.username') || "Username"}
                value={mikrotikUsername}
                onChange={(e) => setMikrotikUsername(e.target.value)}
                placeholder="admin"
                required
                fullWidth
              />
              <TextField
                label={t('network.password')}
                type="password"
                value={mikrotikPassword}
                onChange={(e) => setMikrotikPassword(e.target.value)}
                placeholder={t('network.passwordOptional')}
                fullWidth
              />
              <TextField
                label={t('network.pppoeInterface')}
                value={mikrotikPppoeInterface}
                onChange={(e) => setMikrotikPppoeInterface(e.target.value)}
                placeholder="pppoe-out1"
                helperText={t('network.pppoeInterfaceHelper')}
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
                label={t('network.useSslTls') || "Sử dụng kết nối bảo mật SSL / TLS"}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2.5 }}>
            <Button onClick={() => setMikrotikConfigOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="contained" color="primary" sx={{ fontWeight: 700 }}>
              {t('network.saveAndConnect')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Target Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(confirmDeleteId)}
        title={t('network.deleteTargetTitle')}
        message={t('network.deleteTargetConfirm')}
        onConfirm={handleDeleteTarget}
        onClose={() => setConfirmDeleteId(null)}
      />

      {/* Reconnect PPPoE Confirm Dialog */}
      <ConfirmDialog
        open={confirmReconnectPppoeOpen}
        title={t('network.reconnectPppoeTitle')}
        message={t('network.reconnectPppoeMessage')}
        onConfirm={handleReconnectPppoe}
        onClose={() => setConfirmReconnectPppoeOpen(false)}
      />

      {/* MikroTik Reboot Confirm Dialog */}
      <ConfirmDialog
        open={confirmMikrotikRebootOpen}
        title={t('network.rebootMikrotikTitle')}
        message={t('network.rebootMikrotikMessage')}
        onConfirm={handleRebootMikrotik}
        onClose={() => setConfirmMikrotikRebootOpen(false)}
      />

      {/* Reboot Confirm Dialog (Xiaomi / Gecoos) */}
      <ConfirmDialog
        open={Boolean(confirmRebootTarget)}
        title={t('network.rebootDeviceTitle', { name: confirmRebootTarget?.name || 'Router' })}
        message={t('network.rebootDeviceMessage', { ip: confirmRebootTarget?.ip })}
        onConfirm={handleReboot}
        onClose={() => setConfirmRebootTarget(null)}
      />

      {/* MikroTik Simple Queue Limit Dialog */}
      <Dialog open={queueDialogOpen} onClose={() => setQueueDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSaveQueue}>
          <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Sliders size={20} color={theme.palette.primary.main} /> {queueForm.id ? t('network.queueLimitTitleEdit') : t('network.queueLimitTitleAdd')}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              <TextField
                label={t('network.queueName')}
                value={queueForm.name}
                onChange={(e) => setQueueForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="limit_camera, limit_guest"
                required
                fullWidth
              />
              <TextField
                label={t('network.targetIpSubnet')}
                value={queueForm.target}
                onChange={(e) => setQueueForm(prev => ({ ...prev, target: e.target.value }))}
                placeholder="192.168.1.50 / 192.168.1.0/24"
                helperText={t('network.targetIpSubnetHelper')}
                required
                fullWidth
              />

              <Box>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
                  {t('network.bandwidthPresets')}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  {[
                    { label: '2M / 5M', up: '2M', down: '5M' },
                    { label: '5M / 10M', up: '5M', down: '10M' },
                    { label: '10M / 20M', up: '10M', down: '20M' },
                    { label: '20M / 50M', up: '20M', down: '50M' },
                    { label: '50M / 100M', up: '50M', down: '100M' },
                    { label: '0 / 0 (Unlimited)', up: '0', down: '0' }
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
                    label={t('network.maxUploadLimit')}
                    value={queueForm.uploadLimit}
                    onChange={(e) => setQueueForm(prev => ({ ...prev, uploadLimit: e.target.value }))}
                    placeholder="10M / 512k"
                    helperText={t('network.limitHelperUp')}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label={t('network.maxDownloadLimit')}
                    value={queueForm.downloadLimit}
                    onChange={(e) => setQueueForm(prev => ({ ...prev, downloadLimit: e.target.value }))}
                    placeholder="20M / 2M"
                    helperText={t('network.limitHelperDown')}
                    fullWidth
                  />
                </Grid>
              </Grid>

              <TextField
                label={t('network.comment')}
                value={queueForm.comment}
                onChange={(e) => setQueueForm(prev => ({ ...prev, comment: e.target.value }))}
                placeholder="Limit guest bandwidth"
                fullWidth
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2.5 }}>
            <Button onClick={() => setQueueDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="contained" color="primary" sx={{ fontWeight: 700 }}>
              {queueForm.id ? t('network.applyLimit') : t('network.applyLimit')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Queue Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(confirmDeleteQueueId)}
        title={t('network.deleteQueueTitle')}
        message={t('network.deleteQueueMessage')}
        onConfirm={() => handleDeleteQueue(confirmDeleteQueueId)}
        onClose={() => setConfirmDeleteQueueId(null)}
      />

      {/* Edit Custom IP Name Dialog */}
      <Dialog open={editNameDialog.open} onClose={() => setEditNameDialog(prev => ({ ...prev, open: false }))} maxWidth="xs" fullWidth>
        <form onSubmit={handleSaveCustomName}>
          <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Edit2 size={20} color={theme.palette.primary.main} /> {t('network.customIpNameTitle', { ip: editNameDialog.ip })}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('network.customIpNameDesc')}
              </Typography>
              <TextField
                label={t('network.customNameLabel')}
                value={editNameDialog.newName}
                onChange={(e) => setEditNameDialog(prev => ({ ...prev, newName: e.target.value }))}
                placeholder="VD: Smart TV, Camera..."
                autoFocus
                fullWidth
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2.5, justifyContent: 'space-between' }}>
            {customNames[editNameDialog.ip] ? (
              <Button color="error" size="small" onClick={handleClearCustomName}>
                {t('network.resetName')}
              </Button>
            ) : <Box />}
            <Stack direction="row" spacing={1}>
              <Button onClick={() => setEditNameDialog(prev => ({ ...prev, open: false }))}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant="contained" color="primary">
                {t('network.saveName')}
              </Button>
            </Stack>
          </DialogActions>
        </form>
      </Dialog>
      {/* NAT Templates Dialog */}
      <Dialog open={natTemplateDialogOpen} onClose={() => setNatTemplateDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Layers size={20} color={theme.palette.primary.main} /> {t('network.natTemplatesTitle')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
            {t('network.natTemplatesDesc')}
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
                    {t('network.applyTemplate')}
                  </Button>
                </Card>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setNatTemplateDialogOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* Custom NAT Rule Dialog */}
      <Dialog open={natFormDialogOpen} onClose={() => setNatFormDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSaveNatRule}>
          <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Shield size={20} color={theme.palette.primary.main} /> {t('network.customNatRuleTitle')}
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
                      <MenuItem value="dstnat">{t('network.dstNatPortForward')}</MenuItem>
                      <MenuItem value="srcnat">{t('network.srcNatMasquerade')}</MenuItem>
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
                        <InputLabel>{t('network.protocol')}</InputLabel>
                        <Select
                          value={natForm.protocol}
                          label={t('network.protocol')}
                          onChange={(e) => setNatForm(prev => ({ ...prev, protocol: e.target.value }))}
                        >
                          <MenuItem value="tcp">TCP</MenuItem>
                          <MenuItem value="udp">UDP</MenuItem>
                          <MenuItem value="all">{t('network.all')}</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        size="small"
                        label={t('network.wanInboundPort') || "WAN Inbound Port (Dst. Port)"}
                        value={natForm.dstPort}
                        onChange={(e) => setNatForm(prev => ({ ...prev, dstPort: e.target.value }))}
                        placeholder="80, 443, 3389"
                        fullWidth
                      />
                    </Grid>
                  </Grid>

                  <Grid container spacing={2}>
                    <Grid item xs={7}>
                      <TextField
                        size="small"
                        label={t('network.internalLanIp')}
                        value={natForm.toAddresses}
                        onChange={(e) => setNatForm(prev => ({ ...prev, toAddresses: e.target.value }))}
                        placeholder="192.168.1.50"
                        required
                        fullWidth
                      />
                    </Grid>
                    <Grid item xs={5}>
                      <TextField
                        size="small"
                        label={t('network.internalLanPort')}
                        value={natForm.toPorts}
                        onChange={(e) => setNatForm(prev => ({ ...prev, toPorts: e.target.value }))}
                        placeholder="8080"
                        fullWidth
                      />
                    </Grid>
                  </Grid>
                </>
              )}

              {natForm.chain === 'srcnat' && (
                <TextField
                  size="small"
                  label={t('network.outboundInterface')}
                  value={natForm.outInterface}
                  onChange={(e) => setNatForm(prev => ({ ...prev, outInterface: e.target.value }))}
                  placeholder="pppoe-out1 / ether1"
                  helperText={t('network.outboundInterfaceHelper')}
                  fullWidth
                />
              )}

              <TextField
                size="small"
                label={t('network.comment')}
                value={natForm.comment}
                onChange={(e) => setNatForm(prev => ({ ...prev, comment: e.target.value }))}
                placeholder="Forward Web Server, RDP Desktop..."
                fullWidth
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2.5 }}>
            <Button onClick={() => setNatFormDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="contained" color="primary" sx={{ fontWeight: 700 }}>
              {t('network.applyRule')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete NAT Rule Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(confirmDeleteNatId)}
        title={t('network.deleteNatRuleTitle')}
        message={t('network.deleteNatRuleMessage')}
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
        title={t('network.deleteDeviceTitle')}
        message={t('network.deleteDeviceMessage')}
        onConfirm={() => handleDeleteDevice(confirmDeleteDeviceId)}
        onClose={() => setConfirmDeleteDeviceId(null)}
      />
    </Box>
  );
}
