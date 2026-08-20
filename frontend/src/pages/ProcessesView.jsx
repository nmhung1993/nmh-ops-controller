import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Card,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  TablePagination,
  TextField,
  InputAdornment,
  Button,
  Stack,
  Typography,
  IconButton,
  Tooltip,
  Alert,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Search,
  RotateCw,
  Activity,
  Trash2,
  Lock,
  Camera,
  Server,
  Terminal,
  Play,
  Copy,
  Check
} from 'lucide-react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip
} from '@mui/material';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import { apiRequest } from '../utils/api';
import { formatBytes, formatDateTime } from '../utils/formatters';
import Label from '../components/common/Label';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function ProcessesView() {
  const theme = useTheme();
  const { lang, t } = useLanguage();
  const { isAdmin } = useAuth();
  const { selectedHost, selectedHostId, processesMap } = useWebSocket();

  const [processes, setProcesses] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Kill Dialog state
  const [killTarget, setKillTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Terminal Dialog state
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalCmd, setTerminalCmd] = useState('');
  const [terminalHistory, setTerminalHistory] = useState([
    { command: '# Remote PowerShell / Shell Console đã sẵn sàng', stdout: 'Nhập lệnh hoặc chọn mẫu lệnh bên dưới để thực thi trên máy trạm.', time: '' }
  ]);
  const [runningCmd, setRunningCmd] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);

  const handleRunTerminal = async (cmdToRun) => {
    const script = (cmdToRun || terminalCmd).trim();
    if (!script || !selectedHostId) return;
    setRunningCmd(true);
    try {
      const res = await apiRequest(`/api/v1/hosts/${selectedHostId}/commands`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'system.execute',
          payload: { command: script }
        })
      });
      const cmdId = res.id;
      
      // Poll for command completion (up to 15s)
      let done = false;
      let attempts = 0;
      while (!done && attempts < 15) {
        await new Promise(r => setTimeout(r, 1000));
        attempts++;
        const cmds = await apiRequest(`/api/v1/hosts/${selectedHostId}/commands`);
        const target = cmds.find(c => c.id === cmdId);
        if (target && (target.status === 'succeeded' || target.status === 'failed')) {
          done = true;
          setTerminalHistory(prev => [
            ...prev,
            {
              command: script,
              stdout: target.result?.stdout || target.error || (target.status === 'succeeded' ? '(Thực thi thành công không có output)' : 'Lỗi thực thi'),
              status: target.status,
              time: new Date().toLocaleTimeString()
            }
          ]);
        }
      }
      if (!done) {
        setTerminalHistory(prev => [
          ...prev,
          { command: script, stdout: 'Lệnh đã được gửi đến Agent và đang chạy ngầm...', status: 'queued', time: new Date().toLocaleTimeString() }
        ]);
      }
      setTerminalCmd('');
    } catch (err) {
      setTerminalHistory(prev => [
        ...prev,
        { command: script, stdout: `Lỗi: ${err.message}`, status: 'failed', time: new Date().toLocaleTimeString() }
      ]);
    } finally {
      setRunningCmd(false);
    }
  };

  const PRESET_COMMANDS = [
    { label: 'ipconfig /all', cmd: 'ipconfig /all' },
    { label: 'Get-Service', cmd: 'Get-Service | Where-Object {$_.Status -eq "Running"} | Select-Object -First 15 Name, DisplayName, Status' },
    { label: 'Get-NetIPAddress', cmd: 'Get-NetIPAddress -AddressFamily IPv4 | Select-Object IPAddress, InterfaceAlias' },
    { label: 'Top 10 CPU Processes', cmd: 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Id, ProcessName, CPU' },
    { label: 'Test DNS (8.8.8.8)', cmd: 'Test-NetConnection -ComputerName 8.8.8.8 -Port 53' }
  ];

  const fetchProcesses = async () => {
    if (!selectedHostId) return;
    setLoading(true);
    try {
      const data = await apiRequest(`/api/v1/hosts/${selectedHostId}/processes`);
      setProcesses(data.processes || []);
      setUpdatedAt(data.updatedAt);
    } catch (err) {
      console.error('Failed to fetch processes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedHostId) {
      fetchProcesses();
    }
  }, [selectedHostId]);

  // Listen to live processes from WebSocket
  useEffect(() => {
    if (selectedHostId && processesMap[selectedHostId]) {
      setProcesses(processesMap[selectedHostId]);
      setUpdatedAt(new Date().toISOString());
    }
  }, [selectedHostId, processesMap]);

  const handleKill = async () => {
    if (!killTarget || !selectedHostId) return;
    setActionLoading(true);
    try {
      await apiRequest(`/api/v1/hosts/${selectedHostId}/commands`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'process.kill',
          payload: { pid: killTarget.pid, processName: killTarget.name }
        })
      });
      setToastMessage(t('command.queued'));
      setKillTarget(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const filteredProcesses = useMemo(() => {
    return processes.filter((proc) => {
      const matchSearch =
        !search ||
        proc.name?.toLowerCase().includes(search.toLowerCase()) ||
        String(proc.pid).includes(search) ||
        proc.path?.toLowerCase().includes(search.toLowerCase());
      return matchSearch;
    });
  }, [processes, search]);

  if (!selectedHost) {
    return (
      <Card sx={{ p: 6, textAlign: 'center' }}>
        <Server size={48} color={theme.palette.text.disabled} />
        <Typography variant="h6" sx={{ mt: 2, fontWeight: 700 }}>
          {t('host.none')}
        </Typography>
      </Card>
    );
  }

  return (
    <Box>
      {/* Header & Description */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        alignItems={{ xs: 'flex-start', md: 'center' }}
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 2.5 }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
            {t('process.title')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('process.description')}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} sx={{ width: { xs: 1, md: 'auto' }, flexWrap: 'wrap', gap: 1 }}>
          <TextField
            placeholder={t('process.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            sx={{ width: { xs: '100%', sm: 240 }, bgcolor: 'background.paper', borderRadius: 1.5 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={18} color={theme.palette.text.secondary} />
                </InputAdornment>
              )
            }}
          />
          <Button
            variant="contained"
            startIcon={<RotateCw size={18} className={loading ? 'animate-spin' : ''} />}
            onClick={fetchProcesses}
            disabled={loading}
            sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}
          >
            {t('process.fetch')}
          </Button>

          {isAdmin && (
            <Button
              variant="outlined"
              color="primary"
              startIcon={<Terminal size={18} />}
              onClick={() => setTerminalOpen(true)}
              sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}
            >
              Console
            </Button>
          )}
        </Stack>
      </Stack>

      {toastMessage && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 1.5 }} onClose={() => setToastMessage('')}>
          {toastMessage}
        </Alert>
      )}

      {/* Process Table Card */}
      <Card sx={{ borderRadius: 2.5, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 1.75, px: 2.5, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {filteredProcesses.length} {t('process.snapshotCount')}
          </Typography>
          {updatedAt && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {lang === 'vi' ? 'Cập nhật: ' : 'Updated: '}{formatDateTime(updatedAt, lang)}
            </Typography>
          )}
        </Box>

        <TableContainer sx={{ maxHeight: 'calc(100vh - 280px)', minHeight: 320, overflowY: 'auto', overflowX: 'auto' }}>
          <Table stickyHeader size="small" sx={{ minWidth: { xs: '100%', sm: 650 }, tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: { xs: '40%', sm: '22%' }, fontWeight: 700, py: 1 }}>{t('process.name')}</TableCell>
                <TableCell sx={{ width: { xs: '18%', sm: '10%' }, fontWeight: 700, py: 1 }}>{t('process.pid')}</TableCell>
                <TableCell sx={{ width: { xs: '20%', sm: '12%' }, fontWeight: 700, py: 1 }}>{t('process.cpu')}</TableCell>
                <TableCell sx={{ width: { xs: '22%', sm: '14%' }, fontWeight: 700, py: 1 }}>{t('process.memory')}</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, width: '34%', fontWeight: 700, py: 1 }}>{t('process.path')}</TableCell>
                {isAdmin && <TableCell align="right" sx={{ width: { xs: 48, sm: '8%' }, fontWeight: 700, py: 1 }}>{t('common.actions')}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredProcesses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
                    <Activity size={36} style={{ marginBottom: 8, opacity: 0.4 }} />
                    <Typography variant="body2">{processes.length === 0 ? t('process.none') : (lang === 'vi' ? 'Không tìm thấy tiến trình nào phù hợp.' : 'No matching processes found.')}</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredProcesses
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((proc) => {
                    const cpu = Number(proc.cpuPercent || 0);
                    const mem = Number(proc.memoryBytes || 0);

                    return (
                      <TableRow key={proc.pid} hover>
                        <TableCell sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', py: 0.75 }}>
                          <Tooltip title={`${proc.name} ${proc.path ? `(${proc.path})` : ''}`}>
                            <span style={{ fontSize: '0.8125rem' }}>{proc.name}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary', fontSize: '0.75rem', py: 0.75 }}>{proc.pid}</TableCell>
                        <TableCell sx={{ py: 0.75 }}>
                          <Label variant="soft" color={cpu > 20 ? 'error' : cpu > 5 ? 'warning' : 'default'} sx={{ height: 20, fontSize: '0.7rem', px: 0.5 }}>
                            {cpu.toFixed(1)}%
                          </Label>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', py: 0.75 }}>{formatBytes(mem)}</TableCell>
                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, color: 'text.secondary', fontSize: '0.75rem', fontFamily: proc.path ? 'monospace' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', py: 0.75 }}>
                          {proc.path ? (
                            <Tooltip title={proc.path} placement="top-start">
                              <span>{proc.path}</span>
                            </Tooltip>
                          ) : (
                            <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>{t('common.pathHidden')}</Typography>
                          )}
                        </TableCell>
                        {isAdmin && (
                          <TableCell align="right" sx={{ py: 0.75 }}>
                            <Tooltip title={t('process.kill')}>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => setKillTarget(proc)}
                                sx={{ bgcolor: alpha(theme.palette.error.main, 0.08), p: 0.5 }}
                              >
                                <Trash2 size={14} />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
              )}
            </TableBody>
          </Table>
        </TableContainer>


        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={filteredProcesses.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          sx={{ borderTop: `1px solid ${theme.palette.divider}` }}
        />
      </Card>

      {/* Kill Process Confirmation Dialog */}
      {killTarget && (
        <ConfirmDialog
          open={Boolean(killTarget)}
          title={t('process.kill')}
          content={t('process.killConfirm', { name: killTarget.name, pid: killTarget.pid })}
          confirmText={t('process.kill')}
          color="error"
          loading={actionLoading}
          onConfirm={handleKill}
          onClose={() => setKillTarget(null)}
        />
      )}

      {/* Remote Interactive Terminal Dialog */}
      <Dialog
        open={terminalOpen}
        onClose={() => setTerminalOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: theme.palette.mode === 'dark' ? '#0f172a' : '#1e293b',
            color: '#f8fafc',
            borderRadius: 2
          }
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1.5, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Terminal size={22} color="#38bdf8" />
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#f8fafc' }}>
              Remote PowerShell Console • {selectedHost?.displayName || selectedHost?.hostname}
            </Typography>
          </Stack>
          <Button
            size="small"
            variant="text"
            sx={{ color: '#94a3b8' }}
            onClick={() => setTerminalHistory([])}
          >
            Xóa màn hình (Clear)
          </Button>
        </DialogTitle>

        <DialogContent sx={{ py: 2.5 }}>
          {/* Quick Presets */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', mb: 1, fontWeight: 700 }}>
              MẪU LỆNH NHANH:
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {PRESET_COMMANDS.map((preset, idx) => (
                <Chip
                  key={idx}
                  label={preset.label}
                  size="small"
                  onClick={() => handleRunTerminal(preset.cmd)}
                  disabled={runningCmd}
                  sx={{
                    bgcolor: 'rgba(56, 189, 248, 0.15)',
                    color: '#38bdf8',
                    fontWeight: 600,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'rgba(56, 189, 248, 0.3)' }
                  }}
                />
              ))}
            </Stack>
          </Box>

          {/* Terminal Output Window */}
          <Box
            sx={{
              p: 2,
              minHeight: 280,
              maxHeight: 400,
              overflowY: 'auto',
              bgcolor: '#020617',
              borderRadius: 1.5,
              border: '1px solid rgba(255,255,255,0.1)',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: '0.85rem',
              lineHeight: 1.5
            }}
          >
            {terminalHistory.map((item, idx) => (
              <Box key={idx} sx={{ mb: 1.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography sx={{ color: '#38bdf8', fontWeight: 700, fontFamily: 'inherit', fontSize: 'inherit' }}>
                    PS &gt; {item.command}
                  </Typography>
                  {item.time && (
                    <Typography sx={{ color: '#64748b', fontSize: '0.75rem', fontFamily: 'inherit' }}>
                      {item.time}
                    </Typography>
                  )}
                </Stack>
                <Typography
                  component="pre"
                  sx={{
                    mt: 0.5,
                    color: item.status === 'failed' ? '#f87171' : '#cbd5e1',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    m: 0
                  }}
                >
                  {item.stdout}
                </Typography>
              </Box>
            ))}
            {runningCmd && (
              <Typography sx={{ color: '#facc15', fontStyle: 'italic', fontFamily: 'inherit' }}>
                ⏳ Đang thực thi lệnh trên Agent...
              </Typography>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 2, pt: 0, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRunTerminal();
            }}
            style={{ width: '100%', display: 'flex', gap: '8px', alignItems: 'center' }}
          >
            <TextField
              placeholder="Nhập lệnh PowerShell hoặc CMD (ví dụ: Get-Service, ipconfig)..."
              value={terminalCmd}
              onChange={(e) => setTerminalCmd(e.target.value)}
              disabled={runningCmd}
              size="small"
              fullWidth
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: '#020617',
                  color: '#f8fafc',
                  fontFamily: 'Consolas, Monaco, monospace',
                  fontSize: '0.875rem',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                  '&:hover fieldset': { borderColor: '#38bdf8' }
                }
              }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={runningCmd || !terminalCmd.trim()}
              startIcon={<Play size={16} />}
              sx={{
                bgcolor: '#0284c7',
                color: '#ffffff',
                fontWeight: 700,
                minWidth: 100,
                '&:hover': { bgcolor: '#0369a1' }
              }}
            >
              {runningCmd ? 'Chạy...' : 'Chạy'}
            </Button>
          </form>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
