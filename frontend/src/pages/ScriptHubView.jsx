import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  Grid,
  Stack,
  Typography,
  Button,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  LinearProgress,
  Tooltip,
  Alert,
  Tabs,
  Tab,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Terminal,
  Play,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Download,
  CheckCircle2,
  AlertCircle,
  Clock,
  Server,
  Zap,
  RotateCcw,
  Search,
  Filter,
  Code
} from 'lucide-react';
import { apiRequest } from '../utils/api';
import Label from '../components/common/Label';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useWebSocket } from '../context/WebSocketContext';

// Helper to detect host OS
const detectHostOs = (host) => {
  if (!host) return 'all';
  const plat = (host.platform || host.os || host.system || '').toLowerCase();
  const name = (host.displayName || host.hostname || host.id || '').toLowerCase();
  if (plat.includes('synology') || plat.includes('dsm') || name.includes('synology') || name.includes('dsm')) {
    return 'synology';
  }
  if (plat.includes('home assistant') || plat.includes('homeassistant') || plat.includes('hass') || name.includes('home assistant') || name.includes('hass')) {
    return 'homeassistant';
  }
  if (plat.includes('linux') || plat.includes('ubuntu') || plat.includes('debian') || plat.includes('alpine') || plat.includes('centos')) {
    return 'linux';
  }
  if (plat.includes('win')) {
    return 'windows';
  }
  return 'windows';
};

export default function ScriptHubView() {
  const theme = useTheme();
  const { hosts, refreshHosts } = useWebSocket();

  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');

  // Selected agent for execution
  const [selectedAgentId, setSelectedAgentId] = useState('');

  const selectedHost = hosts?.find(h => h.id === selectedAgentId);
  const selectedHostOs = detectHostOs(selectedHost);

  // Script dialog (Add / Edit)
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [editingScript, setEditingScript] = useState(null);
  const [scriptForm, setScriptForm] = useState({
    name: '',
    description: '',
    platform: 'windows',
    category: 'maintenance',
    scriptContent: ''
  });

  // Execution modal & state
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState(null);
  const [execModalOpen, setExecModalOpen] = useState(false);
  const [activeRunningScript, setActiveRunningScript] = useState(null);

  // Delete confirm
  const [deleteScriptId, setDeleteScriptId] = useState(null);
  const [actionAlert, setActionAlert] = useState(null);

  // Load scripts
  const loadScripts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/v1/scripts');
      setScripts(Array.isArray(res?.scripts) ? res.scripts : []);
    } catch (err) {
      console.error('Failed to load scripts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScripts();
    if (refreshHosts) refreshHosts();
  }, [loadScripts, refreshHosts]);

  // Set default selected agent
  useEffect(() => {
    if (!selectedAgentId && hosts && hosts.length > 0) {
      const onlineHost = hosts.find(h => h.online || h.status === 'online' || h.connected);
      setSelectedAgentId(onlineHost ? onlineHost.id : hosts[0].id);
    }
  }, [hosts, selectedAgentId]);

  // Filtered scripts - Only show scripts matching selected host OS and filters
  const filteredScripts = scripts.filter(s => {
    const q = searchQuery.trim().toLowerCase();
    const matchQuery = !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.scriptContent.toLowerCase().includes(q);
    const matchCat = categoryFilter === 'all' || s.category === categoryFilter;

    // Strict OS Match with selected machine
    const isMatchingSelectedOs = !selectedHost || selectedHostOs === 'all' || s.platform === 'all' || s.platform === selectedHostOs;

    // Platform Filter match
    const matchPlat = platformFilter === 'all' || s.platform === platformFilter || s.platform === 'all';

    return matchQuery && matchCat && isMatchingSelectedOs && matchPlat;
  });

  // Handle run script
  const handleRunScript = async (script) => {
    if (!selectedAgentId) {
      setActionAlert({ type: 'error', text: 'Vui lòng chọn máy trạm đích để chạy kịch bản.' });
      return;
    }

    setActiveRunningScript(script);
    setExecuting(true);
    setExecResult(null);
    setExecModalOpen(true);

    try {
      const res = await apiRequest(`/api/v1/scripts/${script.id}/run`, {
        method: 'POST',
        body: JSON.stringify({ agentId: selectedAgentId })
      });
      setExecResult(res);
    } catch (err) {
      setExecResult({
        success: false,
        error: err.message || 'Lỗi khi thực thi kịch bản'
      });
    } finally {
      setExecuting(false);
    }
  };

  // Open Add Dialog
  const handleOpenAdd = () => {
    setEditingScript(null);
    setScriptForm({
      name: '',
      description: '',
      platform: 'windows',
      category: 'maintenance',
      scriptContent: ''
    });
    setScriptDialogOpen(true);
  };

  // Open Edit Dialog
  const handleOpenEdit = (script) => {
    setEditingScript(script);
    setScriptForm({
      name: script.name,
      description: script.description || '',
      platform: script.platform || 'windows',
      category: script.category || 'custom',
      scriptContent: script.scriptContent
    });
    setScriptDialogOpen(true);
  };

  // Save Script (Create or Update)
  const handleSaveScript = async (e) => {
    if (e) e.preventDefault();
    try {
      if (editingScript) {
        await apiRequest(`/api/v1/scripts/${editingScript.id}`, {
          method: 'PUT',
          body: JSON.stringify(scriptForm)
        });
        setActionAlert({ type: 'success', text: 'Đã cập nhật kịch bản thành công!' });
      } else {
        await apiRequest('/api/v1/scripts', {
          method: 'POST',
          body: JSON.stringify(scriptForm)
        });
        setActionAlert({ type: 'success', text: 'Đã thêm kịch bản mới thành công!' });
      }
      setScriptDialogOpen(false);
      loadScripts();
    } catch (err) {
      setActionAlert({ type: 'error', text: err.message || 'Lỗi khi lưu kịch bản' });
    }
  };

  // Delete Script
  const handleDeleteScript = async (id) => {
    try {
      await apiRequest(`/api/v1/scripts/${id}`, { method: 'DELETE' });
      setActionAlert({ type: 'success', text: 'Đã xóa kịch bản!' });
      setDeleteScriptId(null);
      loadScripts();
    } catch (err) {
      setActionAlert({ type: 'error', text: err.message || 'Lỗi khi xóa kịch bản' });
    }
  };

  // Copy Terminal Output
  const handleCopyOutput = () => {
    if (execResult?.output) {
      navigator.clipboard.writeText(execResult.output);
      setActionAlert({ type: 'success', text: 'Đã sao chép kết quả đầu ra vào clipboard!' });
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header Banner */}
      <Card
        sx={{
          p: 3,
          mb: 3,
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${theme.palette.background.paper} 100%)`,
          borderRadius: 2.5
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: 2,
                bgcolor: 'primary.main',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Terminal size={28} />
            </Box>
            <Box>
              <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: 1.2 }}>
                SMART OPS & AUTOMATION
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                Kho Kịch Bản & Thao Tác Nhanh (Script Hub)
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Thực thi kịch bản PowerShell / Bash 1-Click trên toàn bộ máy trạm, dọn dẹp hệ thống và chẩn đoán từ xa.
              </Typography>
            </Box>
          </Stack>

          <Button
            variant="contained"
            color="primary"
            startIcon={<Plus size={18} />}
            onClick={handleOpenAdd}
            sx={{ fontWeight: 700, borderRadius: 2, alignSelf: { xs: 'flex-start', sm: 'center' } }}
          >
            Thêm Kịch Bản Mới
          </Button>
        </Stack>
      </Card>

      {/* Action Alert */}
      {actionAlert && (
        <Alert
          severity={actionAlert.type}
          onClose={() => setActionAlert(null)}
          sx={{ mb: 3, borderRadius: 2 }}
        >
          {actionAlert.text}
        </Alert>
      )}

      {/* Target Host Selector & Filter Toolbar */}
      <Card sx={{ p: 2.5, mb: 3, borderRadius: 2 }}>
        <Grid container spacing={2} alignItems="center">
          {/* Target Host */}
          <Grid item xs={12} sm={6} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel sx={{ fontWeight: 700 }}>Máy trạm thực thi (Target Agent)</InputLabel>
              <Select
                value={selectedAgentId}
                label="Máy trạm thực thi (Target Agent)"
                onChange={(e) => setSelectedAgentId(e.target.value)}
                renderValue={(val) => {
                  const h = hosts?.find(item => item.id === val);
                  const isHostOnline = Boolean(h?.online || h?.status === 'online' || h?.connected);
                  const name = h?.displayName || h?.hostname || val;
                  const ip = h?.ip || h?.ip_address || '';
                  return (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: isHostOnline ? 'success.main' : 'text.disabled'
                        }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {name} {ip ? `(${ip})` : ''}
                      </Typography>
                    </Stack>
                  );
                }}
              >
                {(hosts || []).map((h) => {
                  const isHostOnline = Boolean(h.online || h.status === 'online' || h.connected);
                  const name = h.displayName || h.hostname || h.id;
                  const ip = h.ip || h.ip_address || '';
                  return (
                    <MenuItem key={h.id} value={h.id}>
                      <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between" sx={{ width: '100%' }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              bgcolor: isHostOnline ? 'success.main' : 'text.disabled'
                            }}
                          />
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {name}
                          </Typography>
                          <Label
                            variant="soft"
                            color={isHostOnline ? 'success' : 'default'}
                            sx={{ fontSize: '0.65rem', height: 18, px: 0.5 }}
                          >
                            {isHostOnline ? 'Online' : 'Offline'}
                          </Label>
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                          {ip ? `IP: ${ip} • ` : ''}{h.platform?.split(' ')[0] || 'OS'}
                        </Typography>
                      </Stack>
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
          </Grid>

          {/* Search */}
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              size="small"
              fullWidth
              placeholder="Tìm theo tên kịch bản, nội dung..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <Search size={16} style={{ marginRight: 8, opacity: 0.6 }} />
              }}
            />
          </Grid>

          {/* Platform Filter */}
          <Grid item xs={6} md={2.5}>
            <FormControl fullWidth size="small">
              <InputLabel>Nền tảng OS</InputLabel>
              <Select
                value={platformFilter}
                label="Nền tảng OS"
                onChange={(e) => setPlatformFilter(e.target.value)}
              >
                <MenuItem value="all">Tất cả hệ điều hành</MenuItem>
                <MenuItem value="windows">Windows (PowerShell)</MenuItem>
                <MenuItem value="linux">Linux (Bash)</MenuItem>
                <MenuItem value="synology">Synology DSM (Bash)</MenuItem>
                <MenuItem value="homeassistant">Home Assistant (Core CLI)</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Category Filter */}
          <Grid item xs={6} md={2.5}>
            <FormControl fullWidth size="small">
              <InputLabel>Phân loại</InputLabel>
              <Select
                value={categoryFilter}
                label="Phân loại"
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <MenuItem value="all">Tất cả danh mục</MenuItem>
                <MenuItem value="maintenance">Bảo trì & Dọn dẹp</MenuItem>
                <MenuItem value="diagnostic">Chẩn đoán & S.M.A.R.T</MenuItem>
                <MenuItem value="network">Mạng & Kết nối</MenuItem>
                <MenuItem value="troubleshooting">Khắc phục sự cố</MenuItem>
                <MenuItem value="custom">Kịch bản tự tạo</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        {/* Selected Host OS Match Indicator */}
        {selectedHost && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2, pt: 1.5, borderTop: `1px dashed ${theme.palette.divider}`, flexWrap: 'wrap', gap: 1 }}>
            <Chip
              size="small"
              icon={<Filter size={13} />}
              label={`Kịch bản tương thích cho: ${selectedHost.displayName || selectedHost.hostname || selectedHost.id} (${selectedHostOs === 'windows' ? 'Windows' : selectedHostOs === 'linux' ? 'Linux' : selectedHostOs === 'synology' ? 'Synology DSM' : selectedHostOs === 'homeassistant' ? 'Home Assistant OS' : selectedHostOs.toUpperCase()})`}
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              • Hệ thống tự động ẩn các script không hỗ trợ trên hệ điều hành này.
            </Typography>
          </Stack>
        )}
      </Card>

      {/* Script Cards Grid */}
      {loading ? (
        <LinearProgress sx={{ my: 4, borderRadius: 2 }} />
      ) : filteredScripts.length === 0 ? (
        <Card sx={{ p: 6, textAlign: 'center', borderRadius: 2.5 }}>
          <Code size={48} color={theme.palette.text.disabled} />
          <Typography variant="h6" sx={{ mt: 2, fontWeight: 700 }}>
            Không tìm thấy kịch bản phù hợp
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
            Thử thay đổi bộ lọc tìm kiếm hoặc tạo kịch bản mới cho hệ thống.
          </Typography>
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={handleOpenAdd}>
            Thêm Kịch Bản
          </Button>
        </Card>
      ) : (
        <Grid container spacing={2.5}>
          {filteredScripts.map((script) => (
            <Grid item xs={12} md={6} lg={4} key={script.id}>
              <Card
                sx={{
                  p: 2.5,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderRadius: 2.5,
                  border: `1px solid ${theme.palette.divider}`,
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: theme.palette.primary.main,
                    boxShadow: theme.shadows[4]
                  }
                }}
              >
                <Box>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Label
                        variant="soft"
                        color={
                          script.platform === 'windows' ? 'info' :
                          script.platform === 'linux' ? 'warning' :
                          script.platform === 'synology' ? 'primary' :
                          script.platform === 'homeassistant' ? 'success' : 'default'
                        }
                      >
                        {
                          script.platform === 'windows' ? 'Windows' :
                          script.platform === 'linux' ? 'Linux' :
                          script.platform === 'synology' ? 'Synology DSM' :
                          script.platform === 'homeassistant' ? 'Home Assistant' : 'All OS'
                        }
                      </Label>
                      {script.isPreset && (
                        <Label variant="soft" color="success">Hệ thống</Label>
                      )}
                    </Stack>

                    {!script.isPreset && (
                      <Stack direction="row" spacing={0.5}>
                        <IconButton size="small" onClick={() => handleOpenEdit(script)}>
                          <Edit2 size={14} />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => setDeleteScriptId(script.id)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </Stack>
                    )}
                  </Stack>

                  <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.8, fontSize: '1rem' }}>
                    {script.name}
                  </Typography>

                  <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.825rem', mb: 2, minHeight: 40 }}>
                    {script.description || 'Kịch bản thực thi tùy biến.'}
                  </Typography>

                  {/* Code snippet preview */}
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 1.5,
                      bgcolor: alpha(theme.palette.common.black, 0.04),
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      color: 'text.secondary',
                      maxHeight: 90,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'pre-wrap',
                      mb: 2,
                      border: `1px solid ${alpha(theme.palette.divider, 0.4)}`
                    }}
                  >
                    {script.scriptContent}
                  </Box>
                </Box>

                {/* Run Button */}
                <Button
                  variant="contained"
                  color="primary"
                  fullWidth
                  startIcon={<Zap size={16} />}
                  onClick={() => handleRunScript(script)}
                  sx={{ fontWeight: 700, borderRadius: 2 }}
                >
                  Chạy ngay (1-Click Run)
                </Button>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Terminal Execution Result Modal */}
      <Dialog open={execModalOpen} onClose={() => !executing && setExecModalOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Terminal size={22} color={theme.palette.primary.main} />
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {activeRunningScript?.name || 'Thực thi Kịch Bản'}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Đích: {hosts?.find(h => h.id === selectedAgentId)?.hostname || selectedAgentId}
              </Typography>
            </Box>
          </Stack>
          {execResult?.durationMs && (
            <Chip
              size="small"
              icon={<Clock size={13} />}
              label={`${execResult.durationMs} ms`}
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          )}
        </DialogTitle>

        <DialogContent>
          {executing ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Terminal size={40} className="spin" color={theme.palette.primary.main} />
              <Typography variant="h6" sx={{ mt: 2, fontWeight: 700 }}>
                Đang truyền lệnh & thực thi kịch bản trên máy trạm...
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                Đang chờ Agent gửi phản hồi output qua kênh WebSocket an toàn.
              </Typography>
              <LinearProgress sx={{ maxWidth: 300, mx: 'auto', mt: 3, borderRadius: 1.5 }} />
            </Box>
          ) : execResult ? (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" spacing={1} alignItems="center">
                  {execResult.success ? (
                    <Chip icon={<CheckCircle2 size={14} />} label="Thành công" color="success" size="small" sx={{ fontWeight: 700 }} />
                  ) : (
                    <Chip icon={<AlertCircle size={14} />} label="Thất bại" color="error" size="small" sx={{ fontWeight: 700 }} />
                  )}
                  {execResult.error && (
                    <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }}>
                      {execResult.error}
                    </Typography>
                  )}
                </Stack>

                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" startIcon={<Copy size={14} />} onClick={handleCopyOutput}>
                    Sao chép
                  </Button>
                </Stack>
              </Stack>

              {/* Terminal Black Screen */}
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: '#0f172a',
                  color: '#38bdf8',
                  fontFamily: 'Consolas, "Fira Code", monospace',
                  fontSize: '0.85rem',
                  maxHeight: 380,
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  border: '1px solid #1e293b',
                  lineHeight: 1.6
                }}
              >
                {execResult.output || execResult.error || 'Thực thi không có đầu ra.'}
              </Box>
            </Stack>
          ) : null}
        </DialogContent>

        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setExecModalOpen(false)} disabled={executing}>
            Đóng
          </Button>
          {execResult && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<RotateCcw size={16} />}
              onClick={() => handleRunScript(activeRunningScript)}
              disabled={executing}
              sx={{ fontWeight: 700 }}
            >
              Chạy lại
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Add / Edit Script Dialog */}
      <Dialog open={scriptDialogOpen} onClose={() => setScriptDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSaveScript}>
          <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Code size={20} color={theme.palette.primary.main} /> {editingScript ? 'Chỉnh Sửa Kịch Bản' : 'Tạo Kịch Bản Mới'}
          </DialogTitle>

          <DialogContent>
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              <TextField
                label="Tên kịch bản (Name)"
                value={scriptForm.name}
                onChange={(e) => setScriptForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="VD: Dọn dẹp Log IIS, Khởi động lại NGINX..."
                required
                fullWidth
              />

              <TextField
                label="Mô tả tác vụ"
                value={scriptForm.description}
                onChange={(e) => setScriptForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="VD: Giải phóng dung lượng log trên máy chủ web"
                fullWidth
              />

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <FormControl fullWidth>
                    <InputLabel>Nền tảng OS</InputLabel>
                    <Select
                      value={scriptForm.platform}
                      label="Nền tảng OS"
                      onChange={(e) => setScriptForm(prev => ({ ...prev, platform: e.target.value }))}
                    >
                      <MenuItem value="windows">Windows (PowerShell)</MenuItem>
                      <MenuItem value="linux">Linux (Bash)</MenuItem>
                      <MenuItem value="synology">Synology DSM (Bash)</MenuItem>
                      <MenuItem value="homeassistant">Home Assistant (Core CLI)</MenuItem>
                      <MenuItem value="all">Tất cả (Cross-platform / Docker)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6}>
                  <FormControl fullWidth>
                    <InputLabel>Phân loại</InputLabel>
                    <Select
                      value={scriptForm.category}
                      label="Phân loại"
                      onChange={(e) => setScriptForm(prev => ({ ...prev, category: e.target.value }))}
                    >
                      <MenuItem value="maintenance">Bảo trì & Dọn dẹp</MenuItem>
                      <MenuItem value="diagnostic">Chẩn đoán & Kiểm tra</MenuItem>
                      <MenuItem value="network">Mạng & Kết nối</MenuItem>
                      <MenuItem value="troubleshooting">Khắc phục sự cố</MenuItem>
                      <MenuItem value="custom">Tùy biến</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <TextField
                label="Nội dung Kịch bản (Script Content)"
                value={scriptForm.scriptContent}
                onChange={(e) => setScriptForm(prev => ({ ...prev, scriptContent: e.target.value }))}
                placeholder={`Write-Output "Executing maintenance task...";\nGet-Service | Where-Object Status -eq 'Stopped';`}
                multiline
                rows={6}
                required
                fullWidth
                InputProps={{
                  sx: { fontFamily: 'Consolas, monospace', fontSize: '0.85rem' }
                }}
              />
            </Stack>
          </DialogContent>

          <DialogActions sx={{ p: 2.5 }}>
            <Button onClick={() => setScriptDialogOpen(false)}>Hủy</Button>
            <Button type="submit" variant="contained" color="primary" sx={{ fontWeight: 700 }}>
              {editingScript ? 'Lưu Thay Đổi' : 'Tạo Kịch Bản'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(deleteScriptId)}
        title="Xóa kịch bản tùy chỉnh?"
        message="Bạn có chắc chắn muốn xóa kịch bản này khỏi Kho Kịch Bản?"
        onConfirm={() => handleDeleteScript(deleteScriptId)}
        onClose={() => setDeleteScriptId(null)}
      />
    </Box>
  );
}
