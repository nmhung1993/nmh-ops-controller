import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardHeader,
  CardContent,
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormGroup,
  FormControlLabel,
  Switch,
  Alert,
  Tooltip,
  Divider,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Settings,
  Server,
  Users,
  Bell,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Edit2,
  Trash2,
  Plus,
  KeyRound,
  Fingerprint,
  Palette,
  Sliders,
  Globe,
  Upload,
  Image as ImageIcon,
  Sun,
  Moon,
  Check
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import { useSystemSettings } from '../context/SystemSettingsContext';
import { useThemeMode } from '../context/ThemeContext';
import { COLOR_PRESETS } from '../theme/palette';
import { apiRequest } from '../utils/api';
import { formatDateTime } from '../utils/formatters';
import Label from '../components/common/Label';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function AdminView() {
  const theme = useTheme();
  const { lang, t } = useLanguage();
  const { user: currentUser } = useAuth();
  const { hosts, refreshHosts } = useWebSocket();
  const { settings: systemSettings, updateSettings } = useSystemSettings();
  const { setThemeColor, setThemeMode } = useThemeMode();

  const [allAgents, setAllAgents] = useState([]);
  const [pendingAgents, setPendingAgents] = useState([]);
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState({ discordWebhook: '' });
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // System & Brand Settings Form State
  const [savingBrand, setSavingBrand] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [brandForm, setBrandForm] = useState({
    appName: 'NMH Ops Controller',
    appSubtitle: 'Unified Fleet & LAN Controller',
    tagline: 'Unified Fleet & LAN Controller',
    logoText: 'NMH',
    logoUrl: '',
    ownerSignature: '@nmhung1993',
    timezone: 'Asia/Ho_Chi_Minh',
    environmentLabel: 'Production LAN',
    primaryColor: '#10B981',
    defaultThemeMode: 'dark',
    restrictPowerMetrics: false
  });

  const handleLogoFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert(t('admin.logoUploadImageOnly'));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert(t('admin.logoSizeLimit'));
      return;
    }

    setUploadingLogo(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await apiRequest('/api/v1/system/logo', {
            method: 'POST',
            body: JSON.stringify({
              data: reader.result,
              filename: file.name,
              mimeType: file.type
            })
          });
          if (res?.logoUrl) {
            setBrandForm(prev => ({ ...prev, logoUrl: res.logoUrl }));
            setToastMessage(t('admin.logoUploadedSuccess'));
          }
        } catch (err) {
          alert(t('admin.logoUploadError', { error: err.message }));
        } finally {
          setUploadingLogo(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      alert(err.message);
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!window.confirm(t('admin.confirmRemoveLogo'))) return;
    try {
      await apiRequest('/api/v1/system/logo', { method: 'DELETE' });
      setBrandForm(prev => ({ ...prev, logoUrl: '' }));
      setToastMessage(t('admin.logoRemovedSuccess'));
    } catch (err) {
      alert(err.message);
    }
  };

  useEffect(() => {
    if (systemSettings) {
      setBrandForm({
        appName: systemSettings.appName || 'NMH Ops',
        appSubtitle: systemSettings.appSubtitle || 'Controller',
        tagline: systemSettings.tagline || 'Unified Fleet & LAN Controller',
        logoText: systemSettings.logoText || 'NMH',
        logoUrl: systemSettings.logoUrl || '',
        ownerSignature: systemSettings.ownerSignature || '@nmhung1993',
        timezone: systemSettings.timezone || 'Asia/Ho_Chi_Minh',
        environmentLabel: systemSettings.environmentLabel || 'Production LAN',
        primaryColor: systemSettings.primaryColor || '#10B981',
        defaultThemeMode: systemSettings.defaultThemeMode || 'dark',
        restrictPowerMetrics: Boolean(systemSettings.restrictPowerMetrics)
      });
    }
  }, [systemSettings]);

  // Agent Edit Dialog
  const [editingAgent, setEditingAgent] = useState(null);
  const [agentDisplayName, setAgentDisplayName] = useState('');
  const [agentNotes, setAgentNotes] = useState('');
  const [agentIncludeHealth, setAgentIncludeHealth] = useState(true);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);

  // Agent Approve Dialog
  const [approvingAgent, setApprovingAgent] = useState(null);
  const [approveDisplayName, setApproveDisplayName] = useState('');
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);

  // Agent Revoke Dialog
  const [revokingAgent, setRevokingAgent] = useState(null);

  // Agent Delete Dialog
  const [deletingAgent, setDeletingAgent] = useState(null);

  // User Add/Edit Dialog
  const DEFAULT_PAGE_PERMISSIONS = {
    network: true,
    docker: true,
    fleet: true,
    dashboard: true,
    processes: true,
    watchdog: true,
    scripts: true,
    activity: true
  };

  const DEFAULT_METRIC_PERMISSIONS = {
    power: true,
    temperature: true,
    health: true,
    gpu: true,
    smart: true
  };

  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('viewer');
  const [formHostIds, setFormHostIds] = useState([]);
  const [formPagePermissions, setFormPagePermissions] = useState(DEFAULT_PAGE_PERMISSIONS);
  const [formMetricPermissions, setFormMetricPermissions] = useState(DEFAULT_METRIC_PERMISSIONS);
  const [userDialogError, setUserDialogError] = useState('');
  const [savingUser, setSavingUser] = useState(false);

  // User Delete Dialog
  const [deletingUser, setDeletingUser] = useState(null);

  // Discord Webhook Form
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [savingWebhook, setSavingWebhook] = useState(false);

  // Smart Multi-Channel Alerting State
  const [alertConfig, setAlertConfig] = useState({
    enabled: true,
    cooldownMinutes: 10,
    channels: {
      telegram: { enabled: false, botToken: '', chatId: '' },
      discord: { enabled: false, webhookUrl: '' },
      webhook: { enabled: false, url: '' }
    },
    thresholds: {
      cpuPercent: 90,
      memoryPercent: 90,
      tempCelsius: 80,
      pingLossPercent: 20
    }
  });
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [testingAlerts, setTestingAlerts] = useState(false);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [agentsData, pendingData, usersData, settingsData, alertRulesData] = await Promise.all([
        apiRequest('/api/v1/agents'),
        apiRequest('/api/v1/agents/pending'),
        apiRequest('/api/v1/users'),
        apiRequest('/api/v1/settings'),
        apiRequest('/api/v1/alerts/rules').catch(() => null)
      ]);
      setAllAgents(agentsData || []);
      setPendingAgents(pendingData || []);
      setUsers(usersData || []);
      setSettings(settingsData || {});
      setDiscordWebhook(settingsData?.discordWebhook || '');
      if (alertRulesData) setAlertConfig(alertRulesData);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAlerts = async (e) => {
    e?.preventDefault();
    setSavingAlerts(true);
    try {
      await apiRequest('/api/v1/alerts/rules', {
        method: 'PUT',
        body: JSON.stringify(alertConfig)
      });
      setToastMessage(t('admin.alertConfigSaved'));
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingAlerts(false);
    }
  };

  const handleTestAlert = async () => {
    setTestingAlerts(true);
    try {
      await apiRequest('/api/v1/alerts/test', { method: 'POST' });
      setToastMessage(t('admin.testNotificationSent'));
    } catch (err) {
      alert(err.message);
    } finally {
      setTestingAlerts(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  // Agent Handlers
  const handleOpenEditAgent = (agent) => {
    setEditingAgent(agent);
    setAgentDisplayName(agent.displayName || agent.hostname);
    setAgentNotes(agent.notes || '');
    setAgentIncludeHealth(agent.includeHealth !== undefined ? Boolean(agent.includeHealth) : true);
    setAgentDialogOpen(true);
  };

  const handleSaveAgent = async (e) => {
    e.preventDefault();
    if (!editingAgent) return;
    try {
      await apiRequest(`/api/v1/agents/${editingAgent.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          displayName: agentDisplayName.trim(),
          notes: agentNotes.trim(),
          includeHealth: agentIncludeHealth
        })
      });
      setToastMessage(t('admin.agentUpdated'));
      setAgentDialogOpen(false);
      fetchAdminData();
      refreshHosts();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleOpenApprove = (agent) => {
    setApprovingAgent(agent);
    setApproveDisplayName(agent.displayName || agent.hostname);
    setApproveDialogOpen(true);
  };

  const handleConfirmApprove = async () => {
    if (!approvingAgent) return;
    try {
      await apiRequest(`/api/v1/agents/${approvingAgent.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ displayName: approveDisplayName.trim() })
      });
      setToastMessage(t('admin.approved'));
      setApproveDialogOpen(false);
      fetchAdminData();
      refreshHosts();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRevokeAgent = async () => {
    if (!revokingAgent) return;
    try {
      await apiRequest(`/api/v1/agents/${revokingAgent.id}/revoke`, {
        method: 'POST'
      });
      setToastMessage(t('admin.agentRevoked'));
      setRevokingAgent(null);
      fetchAdminData();
      refreshHosts();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteAgent = async () => {
    if (!deletingAgent) return;
    try {
      await apiRequest(`/api/v1/agents/${deletingAgent.id}`, {
        method: 'DELETE'
      });
      setToastMessage(t('admin.agentDeletedSuccess'));
      setDeletingAgent(null);
      fetchAdminData();
      refreshHosts();
    } catch (err) {
      alert(err.message);
    }
  };

  // User Handlers
  const handleOpenAddUser = () => {
    setEditingUser(null);
    setFormUsername('');
    setFormPassword('');
    setFormRole('viewer');
    setFormHostIds([]);
    setFormPagePermissions({ ...DEFAULT_PAGE_PERMISSIONS });
    setFormMetricPermissions({ ...DEFAULT_METRIC_PERMISSIONS });
    setUserDialogError('');
    setUserDialogOpen(true);
  };

  const handleOpenEditUser = (u) => {
    setEditingUser(u);
    setFormUsername(u.username);
    setFormPassword('');
    setFormRole(u.role);
    setFormHostIds(u.hostIds || []);
    setFormPagePermissions({
      ...DEFAULT_PAGE_PERMISSIONS,
      ...(u.permissions?.pages || {})
    });
    setFormMetricPermissions({
      ...DEFAULT_METRIC_PERMISSIONS,
      ...(u.permissions?.metrics || {})
    });
    setUserDialogError('');
    setUserDialogOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setUserDialogError('');
    setSavingUser(true);

    const permissionsPayload = formRole === 'super_admin'
      ? null
      : {
          pages: formPagePermissions,
          metrics: formMetricPermissions
        };

    try {
      if (editingUser) {
        await apiRequest(`/api/v1/users/${editingUser.username}`, {
          method: 'PUT',
          body: JSON.stringify({
            role: formRole,
            hostIds: formRole === 'super_admin' ? [] : formHostIds,
            permissions: permissionsPayload,
            password: formPassword || undefined
          })
        });
        setToastMessage(t('user.updated'));
      } else {
        if (!formPassword || formPassword.length < 10) {
          throw new Error(t('admin.passwordMinLength'));
        }
        await apiRequest('/api/v1/users', {
          method: 'POST',
          body: JSON.stringify({
            username: formUsername.trim(),
            password: formPassword,
            role: formRole,
            permissions: permissionsPayload,
            hostIds: formRole === 'super_admin' ? [] : formHostIds
          })
        });
        setToastMessage(t('user.created'));
      }
      setUserDialogOpen(false);
      fetchAdminData();
    } catch (err) {
      setUserDialogError(err.message);
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    try {
      await apiRequest(`/api/v1/users/${deletingUser.username}`, {
        method: 'DELETE'
      });
      setDeletingUser(null);
      fetchAdminData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveWebhook = async (e) => {
    e.preventDefault();
    setSavingWebhook(true);
    try {
      await apiRequest('/api/v1/settings', {
        method: 'PUT',
        body: JSON.stringify({ discordWebhook })
      });
      setToastMessage(t('admin.settingsSaved'));
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleSaveBrandSettings = async (e) => {
    e.preventDefault();
    setSavingBrand(true);
    try {
      await updateSettings(brandForm);
      if (brandForm.primaryColor) setThemeColor(brandForm.primaryColor);
      if (brandForm.defaultThemeMode) setThemeMode(brandForm.defaultThemeMode);
      setToastMessage(t('admin.brandSettingsSaved'));
    } catch (err) {
      alert(t('admin.saveSettingsError', { error: err.message }));
    } finally {
      setSavingBrand(false);
    }
  };

  const approvedHosts = allAgents.filter((a) => a.status === 'approved');

  return (
    <Box>
      {/* Top Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
          {t('admin.title')}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('admin.description')}
        </Typography>
      </Box>

      {toastMessage && (
        <Alert severity="success" sx={{ mb: 3, borderRadius: 1.5 }} onClose={() => setToastMessage('')}>
          {toastMessage}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Section 1: Pending Enrollment (Show if any) */}
        {pendingAgents.length > 0 && (
          <Grid item xs={12}>
            <Card sx={{ border: `2px solid ${theme.palette.warning.main}` }}>
              <CardHeader
                title={t('admin.pending')}
                subheader={t('admin.verify')}
                titleTypographyProps={{ typography: 'h6', fontWeight: 800, color: 'warning.main' }}
                action={
                  <Label variant="filled" color="warning">
                    {t('admin.pendingCount', { count: pendingAgents.length })}
                  </Label>
                }
              />
              <CardContent>
                <Grid container spacing={2}>
                  {pendingAgents.map((agent) => (
                    <Grid item xs={12} md={6} key={agent.id}>
                      <Box
                        sx={{
                          p: 2.5,
                          borderRadius: 2,
                          bgcolor: alpha(theme.palette.warning.main, 0.08),
                          border: `1px solid ${alpha(theme.palette.warning.main, 0.24)}`
                        }}
                      >
                        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                          {agent.hostname}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                          {agent.platform} • {agent.version}
                        </Typography>

                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                          <Fingerprint size={16} color={theme.palette.warning.dark} />
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                            {agent.fingerprint}
                          </Typography>
                        </Stack>

                        <Button
                          variant="contained"
                          color="warning"
                          size="small"
                          onClick={() => handleOpenApprove(agent)}
                        >
                          {t('admin.approve')}
                        </Button>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Section 2: Agent Registry */}
        <Grid item xs={12} lg={7}>
          <Card sx={{ height: 1 }}>
            <CardHeader
              title={t('admin.agents')}
              subheader={t('admin.agentsDescription')}
              titleTypographyProps={{ typography: 'h6', fontWeight: 700 }}
              action={
                <Label variant="soft" color="primary">
                  {allAgents.length}
                </Label>
              }
            />
            <CardContent sx={{ p: 0 }}>
              {allAgents.length === 0 ? (
                <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
                  <Typography variant="body2">{t('admin.noAgents')}</Typography>
                </Box>
              ) : (
                <Stack divider={<Divider />}>
                  {allAgents.map((agent) => {
                    const statusColor = agent.status === 'approved' ? (agent.online ? 'success' : 'default') : agent.status === 'pending' ? 'warning' : 'error';

                    return (
                      <Box key={agent.id} sx={{ p: 2.5, '&:hover': { bgcolor: alpha(theme.palette.grey[500], 0.04) } }}>
                        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
                          <Box>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                                {agent.displayName || agent.hostname}
                              </Typography>
                              <Label variant="soft" color={statusColor}>
                                {agent.status === 'approved' ? (agent.online ? t('common.online') : t('common.offline')) : agent.status}
                              </Label>
                            </Stack>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                              {agent.hostname} • {agent.platform} • {agent.version}
                            </Typography>
                            {agent.notes && (
                              <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic', display: 'block', mt: 0.5 }}>
                                {t('admin.notes', { notes: agent.notes })}
                              </Typography>
                            )}
                          </Box>

                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <Tooltip title={t('admin.editAgentTooltip')}>
                              <IconButton size="small" onClick={() => handleOpenEditAgent(agent)}>
                                <Edit2 size={16} />
                              </IconButton>
                            </Tooltip>
                            {agent.status === 'approved' && (
                              <Tooltip title={t('admin.revokeTooltip')}>
                                <IconButton size="small" color="warning" onClick={() => setRevokingAgent(agent)}>
                                  <ShieldCheck size={16} />
                                </IconButton>
                              </Tooltip>
                            )}
                            {agent.status === 'revoked' && (
                              <>
                                <Tooltip title={t('admin.reapproveTooltip')}>
                                  <IconButton size="small" color="success" onClick={() => handleOpenApprove(agent)}>
                                    <CheckCircle2 size={16} />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title={t('admin.deletePermanentTooltip')}>
                                  <IconButton size="small" color="error" onClick={() => setDeletingAgent(agent)}>
                                    <Trash2 size={16} />
                                  </IconButton>
                                </Tooltip>
                              </>
                            )}
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

        {/* Section 3: User Management */}
        <Grid item xs={12} lg={5}>
          <Card sx={{ height: 1 }}>
            <CardHeader
              title={t('admin.users')}
              titleTypographyProps={{ typography: 'h6', fontWeight: 700 }}
              action={
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<Plus size={16} />}
                  onClick={handleOpenAddUser}
                >
                  {t('admin.addUser')}
                </Button>
              }
            />
            <CardContent sx={{ p: 0 }}>
              <Stack divider={<Divider />}>
                {users.map((u) => {
                  const roleLabel = u.role === 'super_admin' ? t('role.superAdmin') : u.role === 'admin' ? t('role.admin') : t('role.viewer');
                  const roleColor = u.role === 'super_admin' ? 'primary' : u.role === 'admin' ? 'info' : 'default';

                  return (
                    <Box key={u.username} sx={{ p: 2.5, '&:hover': { bgcolor: alpha(theme.palette.grey[500], 0.04) } }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                        <Box>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                              {u.username}
                            </Typography>
                            <Label variant="soft" color={roleColor}>
                              {roleLabel}
                            </Label>
                          </Stack>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {u.role === 'super_admin' ? t('admin.allHosts') : t('admin.hostsAssigned', { count: u.hostIds?.length || 0 })}
                          </Typography>
                        </Box>

                        <Stack direction="row" spacing={1}>
                          <IconButton size="small" onClick={() => handleOpenEditUser(u)}>
                            <Edit2 size={16} />
                          </IconButton>
                          {u.username !== currentUser?.username && (
                            <IconButton size="small" color="error" onClick={() => setDeletingUser(u)}>
                              <Trash2 size={16} />
                            </IconButton>
                          )}
                        </Stack>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Section 4: System, Brand, Theme & Color Customization (Super Admin Only) */}
        <Grid item xs={12}>
          <Card>
            <CardHeader
              title={t('admin.brandCardTitle')}
              subheader={t('admin.brandCardSubheader')}
              titleTypographyProps={{ typography: 'h6', fontWeight: 700 }}
              action={<Palette size={22} color={theme.palette.text.secondary} />}
            />
            <CardContent>
              <form onSubmit={handleSaveBrandSettings}>

                <Grid container spacing={2.5}>
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      label={t('admin.appName')}
                      value={brandForm.appName}
                      onChange={(e) => setBrandForm({ ...brandForm, appName: e.target.value })}
                      required
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      label={t('admin.appSubtitle')}
                      value={brandForm.appSubtitle}
                      onChange={(e) => setBrandForm({ ...brandForm, appSubtitle: e.target.value })}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      label={t('admin.logoText')}
                      value={brandForm.logoText}
                      onChange={(e) => setBrandForm({ ...brandForm, logoText: e.target.value })}
                      helperText={t('admin.logoTextHelper')}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      label={t('admin.ownerSignature')}
                      value={brandForm.ownerSignature}
                      onChange={(e) => setBrandForm({ ...brandForm, ownerSignature: e.target.value })}
                      helperText={t('admin.ownerSignatureHelper')}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <TextField
                      label={t('admin.tagline')}
                      value={brandForm.tagline}
                      onChange={(e) => setBrandForm({ ...brandForm, tagline: e.target.value })}
                      fullWidth
                    />
                  </Grid>
                  {/* Logo Configuration & Upload */}
                  <Grid item xs={12} sm={6} md={4}>
                    <Box sx={{ p: 2, borderRadius: 2, border: `1px dashed ${theme.palette.divider}`, bgcolor: alpha(theme.palette.background.default, 0.5) }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', display: 'block', mb: 1 }}>
                        {t('admin.systemLogo')}
                      </Typography>

                      <Stack direction="row" spacing={2} alignItems="center">
                        <Box
                          sx={{
                            width: 52,
                            height: 52,
                            borderRadius: 2,
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            fontWeight: 800,
                            fontSize: '1rem',
                            flexShrink: 0,
                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)'
                          }}
                        >
                          {brandForm.logoUrl ? (
                            <Box component="img" src={brandForm.logoUrl} alt="Logo" sx={{ width: 1, height: 1, objectFit: 'contain', bgcolor: 'background.paper', p: 0.5 }} />
                          ) : (
                            brandForm.logoText || 'NMH'
                          )}
                        </Box>

                        <Stack direction="column" spacing={0.75} sx={{ minWidth: 0 }}>
                          <Button
                            variant="contained"
                            component="label"
                            size="small"
                            startIcon={<Upload size={14} />}
                            disabled={uploadingLogo}
                            sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                          >
                            {uploadingLogo ? t('admin.uploadingLogo') : t('admin.uploadLogo')}
                            <input
                              type="file"
                              hidden
                              accept="image/png,image/jpeg,image/svg+xml,image/webp"
                              onChange={handleLogoFileUpload}
                            />
                          </Button>

                          {brandForm.logoUrl && (
                            <Button
                              variant="text"
                              color="error"
                              size="small"
                              startIcon={<Trash2 size={13} />}
                              onClick={handleRemoveLogo}
                              sx={{ fontSize: '0.72rem', p: 0 }}
                            >
                              {t('admin.removeCustomLogo')}
                            </Button>
                          )}
                        </Stack>
                      </Stack>
                    </Box>
                  </Grid>

                  <Grid item xs={12} sm={6} md={4}>
                    <TextField
                      label={t('admin.logoUrlLabel')}
                      value={brandForm.logoUrl}
                      onChange={(e) => setBrandForm({ ...brandForm, logoUrl: e.target.value })}
                      placeholder="https://... / data:image/..."
                      helperText={t('admin.logoUrlHelper')}
                      fullWidth
                    />
                  </Grid>

                  {/* Múi giờ */}
                  <Grid item xs={12} sm={6} md={4}>
                    <FormControl fullWidth>
                      <InputLabel>{t('admin.timezone')}</InputLabel>
                      <Select
                        value={brandForm.timezone}
                        label={t('admin.timezone')}
                        onChange={(e) => setBrandForm({ ...brandForm, timezone: e.target.value })}
                      >
                        <MenuItem value="Asia/Ho_Chi_Minh">🇻🇳 Asia/Ho_Chi_Minh (GMT+7)</MenuItem>
                        <MenuItem value="Asia/Bangkok">🇹🇭 Asia/Bangkok (GMT+7)</MenuItem>
                        <MenuItem value="Asia/Tokyo">🇯🇵 Asia/Tokyo (GMT+9)</MenuItem>
                        <MenuItem value="Asia/Singapore">🇸🇬 Asia/Singapore (GMT+8)</MenuItem>
                        <MenuItem value="Europe/London">🇬🇧 Europe/London (GMT+0 / GMT+1)</MenuItem>
                        <MenuItem value="America/New_York">🇺🇸 America/New_York (EST)</MenuItem>
                        <MenuItem value="UTC">🌐 UTC (Coordinated Universal Time)</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  {/* Theme Mode & Primary Accent Color Controls */}
                  <Grid item xs={12}>
                    <Divider sx={{ my: 1, borderStyle: 'dashed' }} />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <Box sx={{ p: 2.5, borderRadius: 2, bgcolor: alpha(theme.palette.background.default, 0.6), border: `1px solid ${theme.palette.divider}` }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Sun size={18} /> {t('admin.defaultThemeMode')}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
                        {t('admin.defaultThemeModeDesc')}
                      </Typography>

                      <Stack direction="row" spacing={2}>
                        <Button
                          variant={brandForm.defaultThemeMode === 'light' ? 'contained' : 'outlined'}
                          startIcon={<Sun size={16} />}
                          onClick={() => {
                            setBrandForm({ ...brandForm, defaultThemeMode: 'light' });
                            setThemeMode('light');
                          }}
                          sx={{ flex: 1, py: 1.25, fontWeight: 700, borderRadius: 2 }}
                        >
                          {t('admin.lightTheme')}
                        </Button>
                        <Button
                          variant={brandForm.defaultThemeMode === 'dark' ? 'contained' : 'outlined'}
                          startIcon={<Moon size={16} />}
                          onClick={() => {
                            setBrandForm({ ...brandForm, defaultThemeMode: 'dark' });
                            setThemeMode('dark');
                          }}
                          sx={{ flex: 1, py: 1.25, fontWeight: 700, borderRadius: 2 }}
                        >
                          {t('admin.darkTheme')}
                        </Button>
                      </Stack>
                    </Box>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <Box sx={{ p: 2.5, borderRadius: 2, bgcolor: alpha(theme.palette.background.default, 0.6), border: `1px solid ${theme.palette.divider}` }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Palette size={18} /> {t('admin.primaryAccentColor')}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                        {t('admin.primaryAccentColorDesc')}
                      </Typography>

                      {/* Presets Grid */}
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, mb: 2 }}>
                        {COLOR_PRESETS.map((preset) => {
                          const isSelected = brandForm.primaryColor === preset.main || brandForm.primaryColor === preset.id;
                          return (
                            <Tooltip key={preset.id} title={preset.label} arrow>
                              <Button
                                size="small"
                                onClick={() => {
                                  setBrandForm({ ...brandForm, primaryColor: preset.main });
                                  setThemeColor(preset.main);
                                }}
                                sx={{
                                  bgcolor: preset.main,
                                  color: '#FFFFFF',
                                  height: 36,
                                  borderRadius: 1.5,
                                  minWidth: 0,
                                  border: isSelected ? '2px solid #FFFFFF' : 'none',
                                  boxShadow: isSelected ? `0 0 0 2px ${preset.main}, 0 4px 8px ${alpha(preset.main, 0.4)}` : 'none',
                                  '&:hover': { bgcolor: preset.dark, transform: 'scale(1.04)' }
                                }}
                              >
                                {isSelected ? <Check size={16} strokeWidth={3} /> : preset.name.slice(0, 3)}
                              </Button>
                            </Tooltip>
                          );
                        })}
                      </Box>

                      {/* Custom Hex Picker Input */}
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box
                          component="input"
                          type="color"
                          value={brandForm.primaryColor.startsWith('#') ? brandForm.primaryColor : '#10B981'}
                          onChange={(e) => {
                            setBrandForm({ ...brandForm, primaryColor: e.target.value });
                            setThemeColor(e.target.value);
                          }}
                          sx={{
                            width: 44,
                            height: 40,
                            p: 0.5,
                            border: `1px solid ${theme.palette.divider}`,
                            borderRadius: 1.5,
                            cursor: 'pointer',
                            bgcolor: 'background.paper'
                          }}
                        />
                        <TextField
                          size="small"
                          label={t('admin.customHexColor')}
                          value={brandForm.primaryColor}
                          onChange={(e) => {
                            setBrandForm({ ...brandForm, primaryColor: e.target.value });
                            if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                              setThemeColor(e.target.value);
                            }
                          }}
                          placeholder="#10B981"
                          fullWidth
                        />
                      </Stack>
                    </Box>
                  </Grid>
                </Grid>

                <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={savingBrand}
                    sx={{ minWidth: 160, fontWeight: 700 }}
                  >
                    {savingBrand ? t('common.saving') : t('admin.saveSystemConfig')}
                  </Button>
                </Box>
              </form>
            </CardContent>
          </Card>
        </Grid>

        {/* Section 5: Smart Multi-Channel Alerting & Thresholds */}
        <Grid item xs={12}>
          <Card>
            <CardHeader
              title={t('admin.smartAlertsTitle')}
              subheader={t('admin.smartAlertsSubheader')}
              titleTypographyProps={{ typography: 'h6', fontWeight: 700 }}
              action={<Bell size={22} color={theme.palette.text.secondary} />}
            />
            <CardContent>
              <form onSubmit={handleSaveAlerts}>
                {/* Master Switch & Cooldown */}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ mb: 3 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={alertConfig.enabled}
                        onChange={(e) => setAlertConfig({ ...alertConfig, enabled: e.target.checked })}
                      />
                    }
                    label={<Typography sx={{ fontWeight: 700 }}>{t('admin.enableSystemAlerts')}</Typography>}
                  />

                  <TextField
                    label={t('admin.alertCooldown')}
                    type="number"
                    size="small"
                    value={alertConfig.cooldownMinutes || 10}
                    onChange={(e) => setAlertConfig({ ...alertConfig, cooldownMinutes: Number(e.target.value) || 10 })}
                    sx={{ width: { xs: 1, sm: 220 } }}
                  />
                </Stack>

                <Divider sx={{ my: 2.5 }} />

                {/* Notification Channels */}
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 2, color: 'primary.main' }}>
                  {t('admin.notificationChannelsHeader')}
                </Typography>

                <Grid container spacing={2.5} sx={{ mb: 3 }}>
                  {/* Telegram Bot */}
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined" sx={{ p: 2, height: 1 }}>
                      <Stack spacing={2}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={Boolean(alertConfig.channels?.telegram?.enabled)}
                              onChange={(e) => setAlertConfig({
                                ...alertConfig,
                                channels: {
                                  ...alertConfig.channels,
                                  telegram: { ...alertConfig.channels?.telegram, enabled: e.target.checked }
                                }
                              })}
                            />
                          }
                          label={<Typography sx={{ fontWeight: 700 }}>{t('admin.telegramBotChannel')}</Typography>}
                        />
                        <TextField
                          label={t('admin.telegramBotToken')}
                          placeholder={t('admin.telegramBotTokenPlaceholder')}
                          size="small"
                          value={alertConfig.channels?.telegram?.botToken || ''}
                          onChange={(e) => setAlertConfig({
                            ...alertConfig,
                            channels: {
                              ...alertConfig.channels,
                              telegram: { ...alertConfig.channels?.telegram, botToken: e.target.value.trim() }
                            }
                          })}
                          fullWidth
                        />
                        <TextField
                          label={t('admin.telegramChatId')}
                          placeholder={t('admin.telegramChatIdPlaceholder')}
                          size="small"
                          value={alertConfig.channels?.telegram?.chatId || ''}
                          onChange={(e) => setAlertConfig({
                            ...alertConfig,
                            channels: {
                              ...alertConfig.channels,
                              telegram: { ...alertConfig.channels?.telegram, chatId: e.target.value.trim() }
                            }
                          })}
                          fullWidth
                        />
                        <TextField
                          label={t('admin.telegramTopicId')}
                          placeholder={t('admin.telegramTopicIdPlaceholder')}
                          size="small"
                          value={alertConfig.channels?.telegram?.topicId || ''}
                          onChange={(e) => setAlertConfig({
                            ...alertConfig,
                            channels: {
                              ...alertConfig.channels,
                              telegram: { ...alertConfig.channels?.telegram, topicId: e.target.value.trim() }
                            }
                          })}
                          fullWidth
                        />
                      </Stack>
                    </Card>
                  </Grid>

                  {/* Discord Webhook */}
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined" sx={{ p: 2, height: 1 }}>
                      <Stack spacing={2}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={Boolean(alertConfig.channels?.discord?.enabled)}
                              onChange={(e) => setAlertConfig({
                                ...alertConfig,
                                channels: {
                                  ...alertConfig.channels,
                                  discord: { ...alertConfig.channels?.discord, enabled: e.target.checked }
                                }
                              })}
                            />
                          }
                          label={<Typography sx={{ fontWeight: 700 }}>{t('admin.discordChannel')}</Typography>}
                        />
                        <TextField
                          label={t('admin.discordWebhookUrl')}
                          placeholder="https://discord.com/api/webhooks/..."
                          size="small"
                          value={alertConfig.channels?.discord?.webhookUrl || discordWebhook}
                          onChange={(e) => {
                            setDiscordWebhook(e.target.value);
                            setAlertConfig({
                              ...alertConfig,
                              channels: {
                                ...alertConfig.channels,
                                discord: { ...alertConfig.channels?.discord, webhookUrl: e.target.value.trim() }
                              }
                            });
                          }}
                          fullWidth
                        />
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {t('admin.discordWebhookHint')}
                        </Typography>
                      </Stack>
                    </Card>
                  </Grid>
                </Grid>

                <Divider sx={{ my: 2.5 }} />

                {/* Threshold Configuration */}
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 2, color: 'primary.main' }}>
                  {t('admin.thresholdsHeader')}
                </Typography>

                <Grid container spacing={2.5}>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      label={t('admin.cpuThreshold')}
                      type="number"
                      size="small"
                      value={alertConfig.thresholds?.cpuPercent || 90}
                      onChange={(e) => setAlertConfig({
                        ...alertConfig,
                        thresholds: { ...alertConfig.thresholds, cpuPercent: Number(e.target.value) }
                      })}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      label={t('admin.memoryThreshold')}
                      type="number"
                      size="small"
                      value={alertConfig.thresholds?.memoryPercent || 90}
                      onChange={(e) => setAlertConfig({
                        ...alertConfig,
                        thresholds: { ...alertConfig.thresholds, memoryPercent: Number(e.target.value) }
                      })}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      label={t('admin.tempThreshold')}
                      type="number"
                      size="small"
                      value={alertConfig.thresholds?.tempCelsius || 80}
                      onChange={(e) => setAlertConfig({
                        ...alertConfig,
                        thresholds: { ...alertConfig.thresholds, tempCelsius: Number(e.target.value) }
                      })}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      label={t('admin.pingLossThreshold')}
                      type="number"
                      size="small"
                      value={alertConfig.thresholds?.pingLossPercent || 20}
                      onChange={(e) => setAlertConfig({
                        ...alertConfig,
                        thresholds: { ...alertConfig.thresholds, pingLossPercent: Number(e.target.value) }
                      })}
                      fullWidth
                    />
                  </Grid>
                </Grid>

                <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 3 }}>
                  <Button
                    type="button"
                    variant="outlined"
                    color="inherit"
                    onClick={handleTestAlert}
                    disabled={testingAlerts}
                  >
                    {testingAlerts ? t('admin.sendingAlert') : t('admin.sendTestAlert')}
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={savingAlerts}
                    sx={{ minWidth: 160, fontWeight: 700 }}
                  >
                    {savingAlerts ? t('common.saving') : t('admin.saveAlertConfig')}
                  </Button>
                </Stack>
              </form>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Edit Agent Dialog */}
      <Dialog open={agentDialogOpen} onClose={() => setAgentDialogOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleSaveAgent}>
          <DialogTitle sx={{ typography: 'h6' }}>{t('agent.editTitle')}</DialogTitle>
          <DialogContent>
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              <TextField
                label={t('agent.displayName')}
                value={agentDisplayName}
                onChange={(e) => setAgentDisplayName(e.target.value)}
                required
                fullWidth
              />
              <TextField
                label={t('agent.notes')}
                value={agentNotes}
                onChange={(e) => setAgentNotes(e.target.value)}
                multiline
                rows={3}
                fullWidth
              />
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={agentIncludeHealth}
                      onChange={(e) => setAgentIncludeHealth(e.target.checked)}
                      color="primary"
                    />
                  }
                  label={t('admin.includeHealthScore')}
                />
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  {t('admin.includeHealthScoreHint')}
                </Typography>
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setAgentDialogOpen(false)} color="inherit">
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="contained">
              {t('common.save')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Approve Agent Dialog */}
      <Dialog open={approveDialogOpen} onClose={() => setApproveDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ typography: 'h6' }}>{t('admin.approve')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('admin.displayNamePrompt')}
            </Typography>
            <TextField
              label={t('agent.displayName')}
              value={approveDisplayName}
              onChange={(e) => setApproveDisplayName(e.target.value)}
              required
              fullWidth
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setApproveDialogOpen(false)} color="inherit">
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirmApprove} variant="contained" color="warning">
            {t('admin.approve')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Revoke Agent Confirmation */}
      {revokingAgent && (
        <ConfirmDialog
          open={Boolean(revokingAgent)}
          title={t('admin.revokeAgent')}
          content={t('admin.revokeConfirm', { host: revokingAgent.displayName || revokingAgent.hostname })}
          confirmText={t('admin.revokeAgent')}
          color="warning"
          onConfirm={handleRevokeAgent}
          onClose={() => setRevokingAgent(null)}
        />
      )}

      {/* Delete Agent Permanently Confirmation */}
      {deletingAgent && (
        <ConfirmDialog
          open={Boolean(deletingAgent)}
          title={t('admin.deletePermanentTitle')}
          content={t('admin.deletePermanentConfirm', { host: deletingAgent.displayName || deletingAgent.hostname, id: deletingAgent.id })}
          confirmText={t('admin.deletePermanentBtn')}
          color="error"
          onConfirm={handleDeleteAgent}
          onClose={() => setDeletingAgent(null)}
        />
      )}

      {/* User Add / Edit Dialog */}
      <Dialog open={userDialogOpen} onClose={() => setUserDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSaveUser}>
          <DialogTitle sx={{ typography: 'h6' }}>
            {editingUser ? t('user.editTitle') : t('user.addTitle')}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              {userDialogError && <Alert severity="error">{userDialogError}</Alert>}

              <TextField
                label={t('user.username')}
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                disabled={Boolean(editingUser)}
                required
                fullWidth
              />

              <TextField
                label={editingUser ? t('user.passwordOptional') : t('user.password')}
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                required={!editingUser}
                fullWidth
              />

              <FormControl fullWidth>
                <InputLabel>{t('user.role')}</InputLabel>
                <Select
                  value={formRole}
                  label={t('user.role')}
                  onChange={(e) => setFormRole(e.target.value)}
                >
                  <MenuItem value="viewer">{t('user.viewer')}</MenuItem>
                  <MenuItem value="admin">{t('user.admin')}</MenuItem>
                  <MenuItem value="super_admin">{t('user.superAdmin')}</MenuItem>
                </Select>
              </FormControl>

              {formRole !== 'super_admin' && (
                <Stack spacing={2.5}>
                  {/* Host Access */}
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                      1. {t('user.hostAccess')}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                      {t('user.hostAccessHelp')}
                    </Typography>

                    <Card variant="outlined" sx={{ p: 1.5, maxHeight: 180, overflowY: 'auto' }}>
                      <FormGroup>
                        {approvedHosts.map((h) => (
                          <FormControlLabel
                            key={h.id}
                            control={
                              <Checkbox
                                size="small"
                                checked={formHostIds.includes(h.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormHostIds([...formHostIds, h.id]);
                                  } else {
                                    setFormHostIds(formHostIds.filter((id) => id !== h.id));
                                  }
                                }}
                              />
                            }
                            label={<Typography variant="body2">{h.displayName || h.hostname} ({h.hostname})</Typography>}
                          />
                        ))}
                      </FormGroup>
                    </Card>
                  </Box>

                  {/* Page Navigation Permissions */}
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                      {t('admin.pagePermissionsHeader')}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                      {t('admin.pagePermissionsHint')}
                    </Typography>

                    <Card variant="outlined" sx={{ p: 1.5 }}>
                      <Grid container spacing={1}>
                        {[
                          { id: 'network', label: t('admin.permNetwork') },
                          { id: 'docker', label: t('admin.permDocker') },
                          { id: 'fleet', label: t('admin.permFleet') },
                          { id: 'dashboard', label: t('admin.permDashboard') },
                          { id: 'processes', label: t('admin.permProcesses') },
                          { id: 'watchdog', label: t('admin.permWatchdog') },
                          { id: 'scripts', label: t('admin.permScripts') },
                          { id: 'activity', label: t('admin.permActivity') }
                        ].map((item) => (
                          <Grid item xs={12} sm={6} key={item.id}>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  size="small"
                                  checked={formPagePermissions[item.id] !== false}
                                  onChange={(e) =>
                                    setFormPagePermissions((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.checked
                                    }))
                                  }
                                />
                              }
                              label={<Typography variant="body2" sx={{ fontWeight: 600 }}>{item.label}</Typography>}
                            />
                          </Grid>
                        ))}
                      </Grid>
                    </Card>
                  </Box>

                  {/* Metrics Visibility in Fleet & Dashboard */}
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                      {t('admin.metricPermissionsHeader')}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                      {t('admin.metricPermissionsHint')}
                    </Typography>

                    <Card variant="outlined" sx={{ p: 1.5 }}>
                      <Grid container spacing={1}>
                        {[
                          { id: 'power', label: t('admin.permMetricPower') },
                          { id: 'temperature', label: t('admin.permMetricTemp') },
                          { id: 'health', label: t('admin.permMetricHealth') },
                          { id: 'gpu', label: t('admin.permMetricGpu') },
                          { id: 'smart', label: t('admin.permMetricSmart') }
                        ].map((item) => (
                          <Grid item xs={12} sm={6} key={item.id}>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  size="small"
                                  checked={formMetricPermissions[item.id] !== false}
                                  onChange={(e) =>
                                    setFormMetricPermissions((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.checked
                                    }))
                                  }
                                />
                              }
                              label={<Typography variant="body2" sx={{ fontWeight: 600 }}>{item.label}</Typography>}
                            />
                          </Grid>
                        ))}
                      </Grid>
                    </Card>
                  </Box>
                </Stack>
              )}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setUserDialogOpen(false)} color="inherit">
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="contained" disabled={savingUser}>
              {savingUser ? '...' : editingUser ? t('user.save') : t('user.create')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete User Confirmation */}
      {deletingUser && (
        <ConfirmDialog
          open={Boolean(deletingUser)}
          title={t('common.delete')}
          content={t('admin.deleteUserConfirm', { user: deletingUser.username })}
          confirmText={t('common.delete')}
          color="error"
          onConfirm={handleDeleteUser}
          onClose={() => setDeletingUser(null)}
        />
      )}
    </Box>
  );
}
