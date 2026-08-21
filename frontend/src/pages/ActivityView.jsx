import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardHeader,
  CardContent,
  Grid,
  Stack,
  Typography,
  Tabs,
  Tab,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Divider,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Tooltip,
  LinearProgress,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Activity,
  Terminal,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  Camera,
  Server,
  User,
  Search,
  Download,
  Filter,
  RefreshCw,
  FileSpreadsheet,
  FileCode,
  ShieldCheck,
  Zap,
  Boxes,
  Globe
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useWebSocket } from '../context/WebSocketContext';
import { apiRequest } from '../utils/api';
import { formatDateTime } from '../utils/formatters';
import Label from '../components/common/Label';

export default function ActivityView() {
  const theme = useTheme();
  const { lang, t } = useLanguage();
  const { hosts, selectedHostId, setSelectedHostId, lastEvent } = useWebSocket();

  const [activeTab, setActiveTab] = useState('audit'); // 'audit' | 'commands'
  const [targetAgentId, setTargetAgentId] = useState(selectedHostId || 'all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [auditLogs, setAuditLogs] = useState([]);
  const [commands, setCommands] = useState([]);
  const [loading, setLoading] = useState(false);

  // Payload & Screenshot modal
  const [selectedPayload, setSelectedPayload] = useState(null);
  const [selectedScreenshotId, setSelectedScreenshotId] = useState(null);

  // Sync selected host
  useEffect(() => {
    if (selectedHostId && targetAgentId !== selectedHostId && targetAgentId !== 'all') {
      setTargetAgentId(selectedHostId);
    }
  }, [selectedHostId]);

  const loadAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (targetAgentId && targetAgentId !== 'all') params.set('agentId', targetAgentId);
      if (severityFilter && severityFilter !== 'all') params.set('severity', severityFilter);
      if (categoryFilter && categoryFilter !== 'all') params.set('category', categoryFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      params.set('limit', '250');

      const res = await apiRequest(`/api/v1/audit-logs?${params.toString()}`);
      setAuditLogs(Array.isArray(res?.logs) ? res.logs : []);

      // If specific host is selected, also load commands
      if (targetAgentId && targetAgentId !== 'all') {
        const cmdRes = await apiRequest(`/api/v1/hosts/${targetAgentId}/commands`);
        setCommands(Array.isArray(cmdRes) ? cmdRes : []);
      } else {
        setCommands([]);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [targetAgentId, severityFilter, categoryFilter, searchQuery]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  const lastProcessedEventRef = React.useRef(null);

  // Insert live event safely without infinite loop and respecting filters
  useEffect(() => {
    if (!lastEvent) return;
    const eventKey = lastEvent.messageId || `${lastEvent.agentId}_${lastEvent.eventType || lastEvent.type}_${lastEvent.occurredAt || ''}`;
    if (lastProcessedEventRef.current === eventKey) return;
    lastProcessedEventRef.current = eventKey;

    // Respect host scope filter
    if (targetAgentId !== 'all' && lastEvent.agentId !== targetAgentId) return;

    // Respect severity filter
    const severity = lastEvent.severity || 'info';
    if (severityFilter !== 'all' && severity !== severityFilter) return;

    setAuditLogs(prev => {
      if (prev.some(item => (item.messageId && item.messageId === lastEvent.messageId) || item.id === eventKey)) {
        return prev;
      }
      const host = hosts?.find(h => h.id === lastEvent.agentId);
      const newEntry = {
        id: eventKey,
        messageId: lastEvent.messageId,
        agentId: lastEvent.agentId || 'system',
        hostName: host?.displayName || host?.hostname || t('common.system'),
        type: lastEvent.type || lastEvent.eventType,
        severity,
        payload: lastEvent.payload || lastEvent,
        occurredAt: lastEvent.occurredAt || new Date().toISOString()
      };
      return [newEntry, ...prev.slice(0, 249)];
    });
  }, [lastEvent, targetAgentId, severityFilter, hosts]);


  // Export CSV Handler
  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (targetAgentId && targetAgentId !== 'all') params.set('agentId', targetAgentId);
    if (severityFilter && severityFilter !== 'all') params.set('severity', severityFilter);
    if (categoryFilter && categoryFilter !== 'all') params.set('category', categoryFilter);
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    params.set('format', 'csv');

    const token = localStorage.getItem('wc_token') || '';
    const url = `/api/v1/audit-logs?${params.toString()}`;

    fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.blob())
      .then(blob => {
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
  };

  // Export JSON Handler
  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(auditLogs, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical':
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'default';
    }
  };

  const getCategoryIcon = (type) => {
    if (type.includes('script')) return <Zap size={14} />;
    if (type.includes('docker')) return <Boxes size={14} />;
    if (type.includes('watchdog')) return <ShieldCheck size={14} />;
    if (type.includes('network') || type.includes('mikrotik')) return <Globe size={14} />;
    if (type.includes('auth') || type.includes('user')) return <User size={14} />;
    return <Activity size={14} />;
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
              <Activity size={28} />
            </Box>
            <Box>
              <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: 1.2 }}>
                SECURITY & AUDIT TRAIL
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {t('activity.headerTitle') || t('activity.title')}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('activity.headerSubtitle') || t('activity.description')}
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileSpreadsheet size={16} />}
              onClick={handleExportCsv}
              sx={{ fontWeight: 700, borderRadius: 2 }}
            >
              {t('activity.exportCsv')}
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileCode size={16} />}
              onClick={handleExportJson}
              sx={{ fontWeight: 700, borderRadius: 2 }}
            >
              {t('activity.exportJson')}
            </Button>
            <IconButton onClick={loadAuditLogs} size="small">
              <RefreshCw size={18} />
            </IconButton>
          </Stack>
        </Stack>
      </Card>

      {/* Toolbar & Filters */}
      <Card sx={{ p: 2.5, mb: 3, borderRadius: 2 }}>
        <Grid container spacing={2} alignItems="center">
          {/* Target Host Filter */}
          <Grid item xs={12} sm={6} md={3.5}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('activity.scopeFilter') || t('activity.scope')}</InputLabel>
              <Select
                value={targetAgentId}
                label={t('activity.scopeFilter') || t('activity.scope')}
                onChange={(e) => setTargetAgentId(e.target.value)}
              >
                <MenuItem value="all">{t('activity.scopeAll')}</MenuItem>
                <MenuItem value="system">{t('activity.scopeServer')}</MenuItem>
                {(hosts || []).map((h) => (
                  <MenuItem key={h.id} value={h.id}>
                    {h.displayName || h.hostname || h.id} {h.ip ? `(${h.ip})` : ''}
                  </MenuItem>
                ))}

              </Select>
            </FormControl>
          </Grid>

          {/* Search Query */}
          <Grid item xs={12} sm={6} md={3.5}>
            <TextField
              size="small"
              fullWidth
              placeholder={t('activity.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <Search size={16} style={{ marginRight: 8, opacity: 0.6 }} />
              }}
            />
          </Grid>

          {/* Category Filter */}
          <Grid item xs={6} md={2.5}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('activity.categoryFilter') || t('activity.category')}</InputLabel>
              <Select
                value={categoryFilter}
                label={t('activity.categoryFilter') || t('activity.category')}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <MenuItem value="all">{t('activity.catAll')}</MenuItem>
                <MenuItem value="scripts">{t('activity.catScripts')}</MenuItem>
                <MenuItem value="auth">{t('activity.catAuth')}</MenuItem>
                <MenuItem value="watchdog">{t('activity.catWatchdog')}</MenuItem>
                <MenuItem value="network">{t('activity.catNetwork')}</MenuItem>
                <MenuItem value="docker">{t('activity.catDocker')}</MenuItem>
                <MenuItem value="process">{t('activity.catProcess')}</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Severity Filter */}
          <Grid item xs={6} md={2.5}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('activity.severityFilter') || t('activity.severity')}</InputLabel>
              <Select
                value={severityFilter}
                label={t('activity.severityFilter') || t('activity.severity')}
                onChange={(e) => setSeverityFilter(e.target.value)}
              >
                <MenuItem value="all">{t('activity.sevAll')}</MenuItem>
                <MenuItem value="info">{t('activity.sevInfo')}</MenuItem>
                <MenuItem value="warning">{t('activity.sevWarning')}</MenuItem>
                <MenuItem value="error">{t('activity.sevError')}</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Card>

      {/* Main Audit List */}
      <Card sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
        <CardHeader
          title={
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {t('activity.eventLogs', { count: auditLogs.length })}
              </Typography>
            </Stack>
          }
        />
        <Divider />

        {loading ? (
          <LinearProgress />
        ) : auditLogs.length === 0 ? (
          <Box sx={{ p: 6, textAlign: 'center', color: 'text.secondary' }}>
            <Activity size={40} style={{ opacity: 0.4, marginBottom: 12 }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {t('activity.noLogs')}
            </Typography>
            <Typography variant="body2">
              {t('activity.noLogsHint')}
            </Typography>
          </Box>
        ) : (
          <Stack divider={<Divider />}>
            {auditLogs.map((log) => {
              const user = log.payload?.user || 'System';
              const actionTitle = log.payload?.action || log.payload?.message || log.type;
              const screenshotId = log.payload?.screenshotId;

              return (
                <Box
                  key={log.id}
                  sx={{
                    p: 2.5,
                    transition: 'all 0.15s',
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.03) }
                  }}
                >
                  <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={2}>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Box
                        sx={{
                          width: 38,
                          height: 38,
                          borderRadius: 2,
                          bgcolor: alpha(
                            log.severity === 'error' ? theme.palette.error.main : log.severity === 'warning' ? theme.palette.warning.main : theme.palette.primary.main,
                            0.12
                          ),
                          color: log.severity === 'error' ? 'error.main' : log.severity === 'warning' ? 'warning.main' : 'primary.main',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        {getCategoryIcon(log.type)}
                      </Box>

                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.3 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                            {actionTitle}
                          </Typography>
                          <Label variant="soft" color={getSeverityColor(log.severity)} sx={{ fontSize: '0.7rem' }}>
                            {log.severity.toUpperCase()}
                          </Label>
                          <Label variant="soft" color="default" sx={{ fontSize: '0.7rem' }}>
                            {log.type}
                          </Label>
                        </Stack>

                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Server size={12} /> {log.hostName} • <User size={12} /> {user} • <Clock size={12} /> {formatDateTime(log.occurredAt)}
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={1} alignItems="center">
                      {screenshotId && (
                        <Tooltip title={t('activity.viewScreenshot')}>
                          <IconButton size="small" color="primary" onClick={() => setSelectedScreenshotId(screenshotId)}>
                            <Camera size={16} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title={t('activity.viewJsonPayload')}>
                        <IconButton size="small" onClick={() => setSelectedPayload(log.payload)}>
                          <Eye size={16} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </Card>

      {/* Payload Modal */}
      <Dialog open={Boolean(selectedPayload)} onClose={() => setSelectedPayload(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>{t('activity.payloadTitle')}</DialogTitle>
        <DialogContent>
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: '#0f172a',
              color: '#38bdf8',
              fontFamily: 'Consolas, monospace',
              fontSize: '0.8rem',
              maxHeight: 400,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}
          >
            {JSON.stringify(selectedPayload, null, 2)}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setSelectedPayload(null)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* Screenshot Modal */}
      <Dialog open={Boolean(selectedScreenshotId)} onClose={() => setSelectedScreenshotId(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>{t('activity.screenshotTitle')}</DialogTitle>
        <DialogContent sx={{ textAlign: 'center', p: 2 }}>
          {selectedScreenshotId && (
            <img
              src={`/api/v1/screenshots/${selectedScreenshotId}`}
              alt="Screenshot"
              style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, objectFit: 'contain' }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setSelectedScreenshotId(null)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
