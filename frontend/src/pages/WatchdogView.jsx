import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Grid,
  Stack,
  Typography,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Alert,
  Tooltip,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  ShieldCheck,
  Plus,
  Play,
  Edit2,
  Trash2,
  Camera,
  Server,
  Terminal,
  Layers,
  RotateCcw
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import { apiRequest } from '../utils/api';
import Label from '../components/common/Label';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function WatchdogView() {
  const theme = useTheme();
  const { lang, t } = useLanguage();
  const { isAdmin } = useAuth();
  const { selectedHost, selectedHostId, watchdogAckMap } = useWebSocket();

  const [watchdogData, setWatchdogData] = useState({ version: 0, rules: [] });
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [formProcessName, setFormProcessName] = useState('');
  const [formFilePath, setFormFilePath] = useState('');
  const [formRunMode, setFormRunMode] = useState('interactive');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formScreenshot, setFormScreenshot] = useState(true);
  const [dialogError, setDialogError] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete State
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchWatchdog = async () => {
    if (!selectedHostId) return;
    setLoading(true);
    try {
      const data = await apiRequest(`/api/v1/hosts/${selectedHostId}/watchdog`);
      setWatchdogData(data);
    } catch (err) {
      console.error('Failed to fetch watchdog:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedHostId) {
      fetchWatchdog();
    }
  }, [selectedHostId]);

  const handleOpenAdd = () => {
    setEditingRule(null);
    setFormProcessName('');
    setFormFilePath('');
    setFormRunMode('interactive');
    setFormEnabled(true);
    setFormScreenshot(true);
    setDialogError('');
    setDialogOpen(true);
  };

  const handleOpenEdit = (rule) => {
    setEditingRule(rule);
    setFormProcessName(rule.processName || '');
    setFormFilePath(rule.filePath || '');
    setFormRunMode(rule.runMode || 'interactive');
    setFormEnabled(rule.enabled !== false);
    setFormScreenshot(rule.screenshot !== false);
    setDialogError('');
    setDialogOpen(true);
  };

  const handleSaveRule = async (e) => {
    e.preventDefault();
    if (!formProcessName.trim() || !formFilePath.trim()) {
      setDialogError('Vui lòng điền đầy đủ tên tiến trình và đường dẫn tệp thực thi.');
      return;
    }

    setSaving(true);
    setDialogError('');

    try {
      const currentRules = watchdogData.rules || [];
      let updatedRules;

      if (editingRule) {
        updatedRules = currentRules.map((r) =>
          r.id === editingRule.id
            ? {
                ...r,
                processName: formProcessName.trim(),
                filePath: formFilePath.trim(),
                runMode: formRunMode,
                enabled: formEnabled,
                screenshot: formScreenshot
              }
            : r
        );
      } else {
        const newRule = {
          id: `rule-${Date.now()}`,
          processName: formProcessName.trim(),
          filePath: formFilePath.trim(),
          runMode: formRunMode,
          enabled: formEnabled,
          screenshot: formScreenshot
        };
        updatedRules = [...currentRules, newRule];
      }

      const res = await apiRequest(`/api/v1/hosts/${selectedHostId}/watchdog`, {
        method: 'PUT',
        body: JSON.stringify({ rules: updatedRules })
      });

      setWatchdogData(res);
      setToastMessage(t('watchdog.configSent'));
      setDialogOpen(false);
    } catch (err) {
      setDialogError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async () => {
    if (!deleteTarget || !selectedHostId) return;
    setSaving(true);
    try {
      const updatedRules = watchdogData.rules.filter((r) => r.id !== deleteTarget.id);
      const res = await apiRequest(`/api/v1/hosts/${selectedHostId}/watchdog`, {
        method: 'PUT',
        body: JSON.stringify({ rules: updatedRules })
      });
      setWatchdogData(res);
      setToastMessage(t('watchdog.configSent'));
      setDeleteTarget(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleManualLaunch = async (rule) => {
    if (!selectedHostId) return;
    try {
      await apiRequest(`/api/v1/hosts/${selectedHostId}/commands`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'watchdog.launch',
          payload: { ruleId: rule.id }
        })
      });
      setToastMessage(t('command.queued'));
    } catch (err) {
      alert(err.message);
    }
  };

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

  const rules = watchdogData.rules || [];

  return (
    <Box>
      {/* Top Header */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
            {t('watchdog.title')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('watchdog.description')}
          </Typography>
        </Box>

        {isAdmin && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<Plus size={18} />}
            onClick={handleOpenAdd}
            sx={{ boxShadow: theme.customShadows.primary }}
          >
            {t('watchdog.add')}
          </Button>
        )}
      </Stack>

      {/* Resilience Banner Card */}
      <Card
        sx={{
          p: 3,
          mb: 4,
          bgcolor: alpha(theme.palette.success.main, 0.08),
          borderColor: alpha(theme.palette.success.main, 0.24),
          display: 'flex',
          alignItems: 'center',
          gap: 2.5
        }}
      >
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 2,
            bgcolor: 'success.main',
            color: 'success.contrastText',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          <ShieldCheck size={26} />
        </Box>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'success.darker' }}>
            {t('watchdog.localFirst')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('watchdog.localFirstDescription')}
          </Typography>
        </Box>
        <Label variant="filled" color="success" sx={{ fontSize: '0.85rem', px: 1.5, py: 1 }}>
          {rules.length} {rules.length === 1 ? 'Rule' : 'Rules'} Active
        </Label>
      </Card>

      {toastMessage && (
        <Alert severity="success" sx={{ mb: 3, borderRadius: 1.5 }} onClose={() => setToastMessage('')}>
          {toastMessage}
        </Alert>
      )}

      {/* Watchdog Rules Grid */}
      {rules.length === 0 ? (
        <Card sx={{ p: 6, textAlign: 'center' }}>
          <ShieldCheck size={48} color={theme.palette.text.disabled} />
          <Typography variant="h6" sx={{ mt: 2, fontWeight: 700 }}>
            {t('watchdog.emptyTitle')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 440, mx: 'auto', mb: 3 }}>
            {t('watchdog.emptyDescription')}
          </Typography>
          {isAdmin && (
            <Button variant="contained" startIcon={<Plus size={18} />} onClick={handleOpenAdd}>
              {t('watchdog.add')}
            </Button>
          )}
        </Card>
      ) : (
        <Grid container spacing={3}>
          {rules.map((rule) => (
            <Grid item xs={12} md={6} key={rule.id}>
              <Card sx={{ p: 3, height: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <Box>
                  <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        {rule.processName}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                        <Terminal size={12} /> {rule.runMode === 'interactive' ? t('watchdog.interactive') : t('watchdog.service')}
                      </Typography>
                    </Box>

                    <Label variant="soft" color={rule.enabled ? 'success' : 'default'}>
                      {rule.enabled ? t('watchdog.enabled') : t('watchdog.disabled')}
                    </Label>
                  </Stack>

                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 1.5,
                      bgcolor: alpha(theme.palette.grey[500], 0.08),
                      fontFamily: 'monospace',
                      fontSize: '0.8125rem',
                      color: 'text.secondary',
                      wordBreak: 'break-all',
                      mb: 2.5
                    }}
                  >
                    {rule.filePath || t('common.pathHidden')}
                  </Box>

                  <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                    <Label variant="outlined" color={rule.enabled ? 'success' : 'default'} startIcon={<RotateCcw size={12} />}>
                      {t('watchdog.enableRestart')}
                    </Label>
                    {rule.screenshot && (
                      <Label variant="outlined" color="info" startIcon={<Camera size={12} />}>
                        {t('watchdog.captureAfter')}
                      </Label>
                    )}
                  </Stack>
                </Box>

                {isAdmin && (
                  <Box sx={{ pt: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Button
                        size="small"
                        variant="outlined"
                        color="primary"
                        startIcon={<Play size={14} />}
                        onClick={() => handleManualLaunch(rule)}
                      >
                        {t('watchdog.launch')}
                      </Button>

                      <Stack direction="row" spacing={1}>
                        <IconButton size="small" onClick={() => handleOpenEdit(rule)}>
                          <Edit2 size={16} />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => setDeleteTarget(rule)}>
                          <Trash2 size={16} />
                        </IconButton>
                      </Stack>
                    </Stack>
                  </Box>
                )}
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Add / Edit Rule Modal */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSaveRule}>
          <DialogTitle sx={{ typography: 'h6', pb: 1 }}>
            {editingRule ? t('watchdog.editTitle') : t('watchdog.addTitle')}
          </DialogTitle>
          <DialogContent sx={{ pb: 2 }}>
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              {dialogError && <Alert severity="error">{dialogError}</Alert>}

              <TextField
                label={t('watchdog.processName')}
                placeholder="parsecd"
                value={formProcessName}
                onChange={(e) => setFormProcessName(e.target.value)}
                required
                fullWidth
              />

              <TextField
                label={t('watchdog.executablePath')}
                placeholder="C:\Program Files\App\app.exe"
                value={formFilePath}
                onChange={(e) => setFormFilePath(e.target.value)}
                required
                fullWidth
              />

              <FormControl fullWidth>
                <InputLabel>{t('watchdog.runMode')}</InputLabel>
                <Select
                  value={formRunMode}
                  label={t('watchdog.runMode')}
                  onChange={(e) => setFormRunMode(e.target.value)}
                >
                  <MenuItem value="interactive">{t('watchdog.interactive')}</MenuItem>
                  <MenuItem value="service">{t('watchdog.service')}</MenuItem>
                </Select>
              </FormControl>

              <FormControlLabel
                control={<Checkbox checked={formEnabled} onChange={(e) => setFormEnabled(e.target.checked)} />}
                label={t('watchdog.enableRestart')}
              />

              <FormControlLabel
                control={<Checkbox checked={formScreenshot} onChange={(e) => setFormScreenshot(e.target.checked)} />}
                label={t('watchdog.captureAfter')}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setDialogOpen(false)} color="inherit">
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? '...' : t('watchdog.save')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Rule Confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title={t('common.delete')}
          content={t('watchdog.deleteConfirm')}
          confirmText={t('common.delete')}
          color="error"
          loading={saving}
          onConfirm={handleDeleteRule}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </Box>
  );
}
