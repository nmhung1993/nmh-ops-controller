import React, { useState, useEffect } from 'react';
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
  User
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useWebSocket } from '../context/WebSocketContext';
import { apiRequest } from '../utils/api';
import { formatDateTime } from '../utils/formatters';
import Label from '../components/common/Label';

export default function ActivityView() {
  const theme = useTheme();
  const { lang, t } = useLanguage();
  const { selectedHost, selectedHostId, lastEvent } = useWebSocket();

  const [events, setEvents] = useState([]);
  const [commands, setCommands] = useState([]);
  const [loading, setLoading] = useState(false);

  // Payload & Screenshot modal
  const [selectedPayload, setSelectedPayload] = useState(null);
  const [selectedScreenshotId, setSelectedScreenshotId] = useState(null);

  const fetchActivity = async () => {
    if (!selectedHostId) return;
    setLoading(true);
    try {
      const [eventRes, cmdRes] = await Promise.all([
        apiRequest(`/api/v1/hosts/${selectedHostId}/events`),
        apiRequest(`/api/v1/hosts/${selectedHostId}/commands`)
      ]);
      setEvents(eventRes || []);
      setCommands(cmdRes || []);
    } catch (err) {
      console.error('Failed to fetch activity:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedHostId) {
      fetchActivity();
    }
  }, [selectedHostId]);

  // Insert live event if it belongs to selected host
  useEffect(() => {
    if (lastEvent && lastEvent.agentId === selectedHostId) {
      setEvents((prev) => [lastEvent, ...prev]);
    }
  }, [lastEvent, selectedHostId]);

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

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      default:
        return 'info';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'succeeded':
        return 'success';
      case 'failed':
      case 'expired':
        return 'error';
      case 'sent':
      case 'acknowledged':
        return 'info';
      default:
        return 'warning';
    }
  };

  return (
    <Box>
      {/* Top Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
          {t('activity.title')}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('activity.description')}
        </Typography>
      </Box>

      {/* Two Column Grid for Events & Commands */}
      <Grid container spacing={3}>
        {/* Left: System Events */}
        <Grid item xs={12} lg={6}>
          <Card sx={{ height: 1, display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              title={t('activity.events')}
              titleTypographyProps={{ typography: 'h6', fontWeight: 700 }}
              action={
                <Label variant="soft" color="primary">
                  {events.length}
                </Label>
              }
            />
            <CardContent sx={{ flexGrow: 1, p: 0 }}>
              {events.length === 0 ? (
                <Box sx={{ p: 6, textAlign: 'center', color: 'text.secondary' }}>
                  <Activity size={36} style={{ opacity: 0.4, marginBottom: 8 }} />
                  <Typography variant="body2">{t('activity.noEvents')}</Typography>
                </Box>
              ) : (
                <Stack divider={<Divider />} sx={{ maxHeight: 600, overflowY: 'auto' }}>
                  {events.map((ev, idx) => {
                    const eventText = t(`event.${ev.type}`) !== `event.${ev.type}` ? t(`event.${ev.type}`) : (ev.type || 'System Event');
                    const screenshotId = ev.payload?.screenshotId;

                    return (
                      <Box key={idx} sx={{ p: 2.5, '&:hover': { bgcolor: alpha(theme.palette.grey[500], 0.04) } }}>
                        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
                          <Stack direction="row" spacing={1.5} alignItems="flex-start">
                            <Box sx={{ mt: 0.5 }}>
                              <Label variant="filled" color={getSeverityColor(ev.severity)} sx={{ width: 8, height: 8, p: 0, minWidth: 8, borderRadius: '50%' }} />
                            </Box>
                            <Box>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                {eventText}
                              </Typography>
                              {ev.payload?.processName && (
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                                  Tiến trình: <b>{ev.payload.processName}</b>
                                </Typography>
                              )}
                              <Typography variant="caption" sx={{ color: 'text.disabled', display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                <Clock size={12} /> {formatDateTime(ev.occurredAt, lang)}
                              </Typography>
                            </Box>
                          </Stack>

                          <Stack direction="row" spacing={0.5}>
                            {screenshotId && (
                              <IconButton
                                size="small"
                                color="info"
                                onClick={() => setSelectedScreenshotId(screenshotId)}
                                sx={{ bgcolor: alpha(theme.palette.info.main, 0.1) }}
                              >
                                <Camera size={16} />
                              </IconButton>
                            )}
                            <IconButton size="small" onClick={() => setSelectedPayload(ev.payload || {})}>
                              <Eye size={16} />
                            </IconButton>
                          </Stack>
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Right: Command Audit */}
        <Grid item xs={12} lg={6}>
          <Card sx={{ height: 1, display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              title={t('activity.commands')}
              titleTypographyProps={{ typography: 'h6', fontWeight: 700 }}
              action={
                <Label variant="soft" color="info">
                  {commands.length}
                </Label>
              }
            />
            <CardContent sx={{ flexGrow: 1, p: 0 }}>
              {commands.length === 0 ? (
                <Box sx={{ p: 6, textAlign: 'center', color: 'text.secondary' }}>
                  <Terminal size={36} style={{ opacity: 0.4, marginBottom: 8 }} />
                  <Typography variant="body2">{t('activity.noCommands')}</Typography>
                </Box>
              ) : (
                <Stack divider={<Divider />} sx={{ maxHeight: 600, overflowY: 'auto' }}>
                  {commands.map((cmd) => {
                    const cmdLabel = t(`command.type.${cmd.type}`) !== `command.type.${cmd.type}` ? t(`command.type.${cmd.type}`) : cmd.type;
                    const statusLabel = t(`status.${cmd.status}`) !== `status.${cmd.status}` ? t(`status.${cmd.status}`) : cmd.status;

                    return (
                      <Box key={cmd.id} sx={{ p: 2.5, '&:hover': { bgcolor: alpha(theme.palette.grey[500], 0.04) } }}>
                        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
                          <Box>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                {cmdLabel}
                              </Typography>
                              <Label variant="soft" color={getStatusColor(cmd.status)}>
                                {statusLabel}
                              </Label>
                            </Stack>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <User size={12} /> {t('activity.requestedBy', { user: cmd.requestedBy || 'Admin' })}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.disabled', display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                              <Clock size={12} /> {formatDateTime(cmd.requestedAt, lang)}
                            </Typography>
                          </Box>

                          {cmd.result && (
                            <IconButton size="small" onClick={() => setSelectedPayload(cmd.result)}>
                              <Eye size={16} />
                            </IconButton>
                          )}
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* JSON Payload Inspector Dialog */}
      <Dialog open={Boolean(selectedPayload)} onClose={() => setSelectedPayload(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ typography: 'h6' }}>Chi tiết dữ liệu (Payload)</DialogTitle>
        <DialogContent>
          <Box
            component="pre"
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.grey[500], 0.08),
              fontFamily: 'monospace',
              fontSize: '0.8125rem',
              overflowX: 'auto'
            }}
          >
            {JSON.stringify(selectedPayload, null, 2)}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setSelectedPayload(null)} variant="contained">
            Đóng
          </Button>
        </DialogActions>
      </Dialog>

      {/* Screenshot Viewer Dialog */}
      <Dialog open={Boolean(selectedScreenshotId)} onClose={() => setSelectedScreenshotId(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ typography: 'h6' }}>Ảnh chụp cửa sổ ứng dụng</DialogTitle>
        <DialogContent sx={{ textAlign: 'center', p: 2 }}>
          {selectedScreenshotId && (
            <Box
              component="img"
              src={`/api/v1/screenshots/${selectedScreenshotId}`}
              alt="Screenshot"
              sx={{
                maxWidth: '100%',
                maxHeight: '70vh',
                borderRadius: 2,
                boxShadow: theme.customShadows.z16,
                border: `1px solid ${theme.palette.divider}`
              }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setSelectedScreenshotId(null)} variant="contained">
            Đóng
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
