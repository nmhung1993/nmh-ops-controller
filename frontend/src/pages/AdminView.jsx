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
  Globe
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import { useSystemSettings } from '../context/SystemSettingsContext';
import { apiRequest } from '../utils/api';
import { formatDateTime } from '../utils/formatters';
import Label from '../components/common/Label';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function AdminView() {
  const theme = useTheme();
  const { lang, t } = useLanguage();
  const { user: currentUser } = useAuth();
  const { hosts, refreshHosts } = useWebSocket();
  const { settings: systemSettings, updateSettings: updateSystemSettings } = useSystemSettings();

  const [allAgents, setAllAgents] = useState([]);
  const [pendingAgents, setPendingAgents] = useState([]);
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState({ discordWebhook: '' });
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // System & Brand Settings Form State
  const [brandForm, setBrandForm] = useState({
    appName: '',
    appSubtitle: '',
    tagline: '',
    logoText: '',
    logoUrl: '',
    ownerSignature: '',
    timezone: 'Asia/Ho_Chi_Minh',
    environmentLabel: 'LAN tin cậy'
  });
  const [savingBrand, setSavingBrand] = useState(false);

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
        environmentLabel: systemSettings.environmentLabel || 'LAN tin cậy'
      });
    }
  }, [systemSettings]);

  // Agent Edit Dialog
  const [editingAgent, setEditingAgent] = useState(null);
  const [agentDisplayName, setAgentDisplayName] = useState('');
  const [agentNotes, setAgentNotes] = useState('');
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);

  // Agent Approve Dialog
  const [approvingAgent, setApprovingAgent] = useState(null);
  const [approveDisplayName, setApproveDisplayName] = useState('');
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);

  // Agent Revoke Dialog
  const [revokingAgent, setRevokingAgent] = useState(null);

  // User Add/Edit Dialog
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('viewer');
  const [formHostIds, setFormHostIds] = useState([]);
  const [userDialogError, setUserDialogError] = useState('');
  const [savingUser, setSavingUser] = useState(false);

  // User Delete Dialog
  const [deletingUser, setDeletingUser] = useState(null);

  // Discord Webhook Form
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [savingWebhook, setSavingWebhook] = useState(false);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [agentsData, pendingData, usersData, settingsData] = await Promise.all([
        apiRequest('/api/v1/agents'),
        apiRequest('/api/v1/agents/pending'),
        apiRequest('/api/v1/users'),
        apiRequest('/api/v1/settings')
      ]);
      setAllAgents(agentsData || []);
      setPendingAgents(pendingData || []);
      setUsers(usersData || []);
      setSettings(settingsData || {});
      setDiscordWebhook(settingsData?.discordWebhook || '');
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
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
          notes: agentNotes.trim()
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

  // User Handlers
  const handleOpenAddUser = () => {
    setEditingUser(null);
    setFormUsername('');
    setFormPassword('');
    setFormRole('viewer');
    setFormHostIds([]);
    setUserDialogError('');
    setUserDialogOpen(true);
  };

  const handleOpenEditUser = (u) => {
    setEditingUser(u);
    setFormUsername(u.username);
    setFormPassword('');
    setFormRole(u.role);
    setFormHostIds(u.hostIds || []);
    setUserDialogError('');
    setUserDialogOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setUserDialogError('');
    setSavingUser(true);

    try {
      if (editingUser) {
        await apiRequest(`/api/v1/users/${editingUser.username}`, {
          method: 'PUT',
          body: JSON.stringify({
            role: formRole,
            hostIds: formRole === 'super_admin' ? [] : formHostIds,
            password: formPassword || undefined
          })
        });
        setToastMessage(t('user.updated'));
      } else {
        if (!formPassword || formPassword.length < 10) {
          throw new Error('Mật khẩu tối thiểu phải 10 ký tự');
        }
        await apiRequest('/api/v1/users', {
          method: 'POST',
          body: JSON.stringify({
            username: formUsername.trim(),
            password: formPassword,
            role: formRole,
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

  const handleSaveBrand = async (e) => {
    e.preventDefault();
    setSavingBrand(true);
    try {
      await updateSystemSettings(brandForm);
      setToastMessage('Đã lưu cấu hình hệ thống & nhận diện thành công!');
    } catch (err) {
      alert(err.message);
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
                    {pendingAgents.length} Chờ duyệt
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
                                Ghi chú: {agent.notes}
                              </Typography>
                            )}
                          </Box>

                          <Stack direction="row" spacing={1}>
                            <IconButton size="small" onClick={() => handleOpenEditAgent(agent)}>
                              <Edit2 size={16} />
                            </IconButton>
                            {agent.status === 'approved' && (
                              <IconButton size="small" color="error" onClick={() => setRevokingAgent(agent)}>
                                <Trash2 size={16} />
                              </IconButton>
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
                            {u.role === 'super_admin' ? 'Tất cả máy trạm' : `${u.hostIds?.length || 0} máy được phân quyền`}
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

        {/* Section 4: System & Brand Customization (Super Admin Only) */}
        <Grid item xs={12}>
          <Card>
            <CardHeader
              title="Cấu hình Hệ thống, Nhận diện & Múi giờ"
              subheader="Tùy biến tên hệ thống, logo, chữ ký owner và múi giờ hiển thị toàn cục"
              titleTypographyProps={{ typography: 'h6', fontWeight: 700 }}
              action={<Palette size={22} color={theme.palette.text.secondary} />}
            />
            <CardContent>
              <form onSubmit={handleSaveBrand}>
                <Grid container spacing={2.5}>
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      label="Tên hệ thống (App Name)"
                      value={brandForm.appName}
                      onChange={(e) => setBrandForm({ ...brandForm, appName: e.target.value })}
                      required
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      label="Phụ đề / Vai trò (Subtitle)"
                      value={brandForm.appSubtitle}
                      onChange={(e) => setBrandForm({ ...brandForm, appSubtitle: e.target.value })}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      label="Ký tự Logo Badge"
                      value={brandForm.logoText}
                      onChange={(e) => setBrandForm({ ...brandForm, logoText: e.target.value })}
                      helperText="Ví dụ: NMH, OPS, LAB"
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      label="Chữ ký Footer / Owner"
                      value={brandForm.ownerSignature}
                      onChange={(e) => setBrandForm({ ...brandForm, ownerSignature: e.target.value })}
                      helperText="Ví dụ: @nmhung1993"
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <TextField
                      label="Slogan / Tagline (Hero Title)"
                      value={brandForm.tagline}
                      onChange={(e) => setBrandForm({ ...brandForm, tagline: e.target.value })}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <TextField
                      label="Đường dẫn ảnh Logo URL (Tùy chọn)"
                      value={brandForm.logoUrl}
                      onChange={(e) => setBrandForm({ ...brandForm, logoUrl: e.target.value })}
                      placeholder="https://... hoặc data:image/..."
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <FormControl fullWidth>
                      <InputLabel>Múi giờ hiển thị (Timezone)</InputLabel>
                      <Select
                        value={brandForm.timezone}
                        label="Múi giờ hiển thị (Timezone)"
                        onChange={(e) => setBrandForm({ ...brandForm, timezone: e.target.value })}
                      >
                        <MenuItem value="Asia/Ho_Chi_Minh">🇻🇳 Asia/Ho_Chi_Minh (GMT+7 - Mặc định)</MenuItem>
                        <MenuItem value="Asia/Bangkok">🇹🇭 Asia/Bangkok (GMT+7)</MenuItem>
                        <MenuItem value="Asia/Tokyo">🇯🇵 Asia/Tokyo (GMT+9)</MenuItem>
                        <MenuItem value="Asia/Singapore">🇸🇬 Asia/Singapore (GMT+8)</MenuItem>
                        <MenuItem value="Europe/London">🇬🇧 Europe/London (GMT+0 / GMT+1)</MenuItem>
                        <MenuItem value="America/New_York">🇺🇸 America/New_York (EST)</MenuItem>
                        <MenuItem value="UTC">🌐 UTC (Coordinated Universal Time)</MenuItem>
                      </Select>
                    </FormControl>
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
                    {savingBrand ? 'Đang lưu...' : 'Lưu cấu hình hệ thống'}
                  </Button>
                </Box>
              </form>
            </CardContent>
          </Card>
        </Grid>

        {/* Section 5: Discord Webhook Integration */}
        <Grid item xs={12}>
          <Card>
            <CardHeader
              title={t('admin.integrations')}
              subheader={t('admin.webhookCentral')}
              titleTypographyProps={{ typography: 'h6', fontWeight: 700 }}
              action={<Bell size={22} color={theme.palette.text.secondary} />}
            />
            <CardContent>
              <form onSubmit={handleSaveWebhook}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    label={t('admin.discordWebhook')}
                    placeholder="https://discord.com/api/webhooks/..."
                    value={discordWebhook}
                    onChange={(e) => setDiscordWebhook(e.target.value)}
                    fullWidth
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={savingWebhook}
                    sx={{ minWidth: 140, whiteSpace: 'nowrap' }}
                  >
                    {savingWebhook ? '...' : t('admin.saveSettings')}
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
          color="error"
          onConfirm={handleRevokeAgent}
          onClose={() => setRevokingAgent(null)}
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
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    {t('user.hostAccess')}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                    {t('user.hostAccessHelp')}
                  </Typography>

                  <Card sx={{ p: 1.5, maxHeight: 200, overflowY: 'auto' }}>
                    <FormGroup>
                      {approvedHosts.map((h) => (
                        <FormControlLabel
                          key={h.id}
                          control={
                            <Checkbox
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
                          label={`${h.displayName || h.hostname} (${h.hostname})`}
                        />
                      ))}
                    </FormGroup>
                  </Card>
                </Box>
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
