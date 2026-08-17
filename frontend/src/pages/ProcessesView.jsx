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
  Server
} from 'lucide-react';
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
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
            {t('process.title')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('process.description')}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} sx={{ width: { xs: 1, sm: 'auto' } }}>
          <TextField
            placeholder={t('process.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            sx={{ width: { xs: 1, sm: 260 }, bgcolor: 'background.paper', borderRadius: 1.5 }}
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
            sx={{ whiteSpace: 'nowrap' }}
          >
            {t('process.fetch')}
          </Button>
        </Stack>
      </Stack>

      {toastMessage && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 1.5 }} onClose={() => setToastMessage('')}>
          {toastMessage}
        </Alert>
      )}

      {/* Process Table Card */}
      <Card>
        <Box sx={{ p: 2, px: 3, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {filteredProcesses.length} {t('process.snapshotCount')}
          </Typography>
          {updatedAt && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Cập nhật: {formatDateTime(updatedAt, lang)}
            </Typography>
          )}
        </Box>

        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 200 }}>{t('process.name')}</TableCell>
                <TableCell sx={{ minWidth: 100 }}>{t('process.pid')}</TableCell>
                <TableCell sx={{ minWidth: 100 }}>{t('process.cpu')}</TableCell>
                <TableCell sx={{ minWidth: 120 }}>{t('process.memory')}</TableCell>
                <TableCell sx={{ minWidth: 280 }}>{t('process.path')}</TableCell>
                {isAdmin && <TableCell align="right" sx={{ minWidth: 80 }}>{t('common.actions')}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredProcesses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
                    <Activity size={36} style={{ marginBottom: 8, opacity: 0.4 }} />
                    <Typography variant="body2">{processes.length === 0 ? t('process.none') : 'Không tìm thấy tiến trình nào phù hợp.'}</Typography>
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
                        <TableCell sx={{ fontWeight: 700 }}>{proc.name}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{proc.pid}</TableCell>
                        <TableCell>
                          <Label variant="soft" color={cpu > 20 ? 'error' : cpu > 5 ? 'warning' : 'default'}>
                            {cpu.toFixed(1)}%
                          </Label>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{formatBytes(mem)}</TableCell>
                        <TableCell sx={{ color: 'text.secondary', fontSize: '0.8125rem', fontFamily: proc.path ? 'monospace' : 'inherit' }}>
                          {proc.path || <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>{t('common.pathHidden')}</Typography>}
                        </TableCell>
                        {isAdmin && (
                          <TableCell align="right">
                            <Tooltip title={t('process.kill')}>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => setKillTarget(proc)}
                                sx={{ bgcolor: alpha(theme.palette.error.main, 0.08) }}
                              >
                                <Trash2 size={16} />
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
    </Box>
  );
}
