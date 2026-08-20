import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Grid,
  FormControlLabel,
  Switch,
  Alert,
  Typography,
  Box,
  useTheme
} from '@mui/material';
import { Server, Shield, Wifi } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const DEVICE_TYPES = [
  { value: 'mikrotik', key: 'deviceDialog.typeMikrotik', role: 'gateway', defaultPort: 8728, defaultUser: 'admin' },
  { value: 'openwrt', key: 'deviceDialog.typeOpenwrt', role: 'gateway', defaultPort: 80, defaultUser: 'root' },
  { value: 'zte', key: 'deviceDialog.typeZte', role: 'router_mesh', defaultPort: 80, defaultUser: 'admin' },
  { value: 'tplink_deco', key: 'deviceDialog.typeTplinkDeco', role: 'router_mesh', defaultPort: 80, defaultUser: 'admin' },
  { value: 'xiaomi', key: 'deviceDialog.typeXiaomi', role: 'router_mesh', defaultPort: 80, defaultUser: 'admin' },
  { value: 'gecoos', key: 'deviceDialog.typeGecoos', role: 'router_mesh', defaultPort: 80, defaultUser: 'admin' },
  { value: 'generic', key: 'deviceDialog.typeGeneric', role: 'router_mesh', defaultPort: 80, defaultUser: 'admin' }
];

export default function NetworkDeviceDialog({ open, onClose, onSave, editingDevice, defaultRole = 'gateway' }) {
  const theme = useTheme();
  const { lang, t } = useLanguage();

  const [form, setForm] = useState({
    name: '',
    role: defaultRole,
    type: defaultRole === 'gateway' ? 'mikrotik' : 'xiaomi',
    host: '192.168.1.1',
    port: 8728,
    username: 'admin',
    password: '',
    useHttps: false,
    pppoeInterface: 'pppoe-out1'
  });

  useEffect(() => {
    if (editingDevice) {
      setForm({
        name: editingDevice.name || '',
        role: editingDevice.role || defaultRole,
        type: editingDevice.type || (defaultRole === 'gateway' ? 'mikrotik' : 'xiaomi'),
        host: editingDevice.host || '',
        port: editingDevice.port || 80,
        username: editingDevice.username || '',
        password: editingDevice.password || '',
        useHttps: Boolean(editingDevice.useHttps),
        pppoeInterface: editingDevice.pppoeInterface || 'pppoe-out1'
      });
    } else {
      const typeDef = DEVICE_TYPES.find(d => d.role === defaultRole) || DEVICE_TYPES[0];
      setForm({
        name: defaultRole === 'gateway' ? 'MikroTik Core Gateway' : 'Xiaomi Mesh Wi-Fi',
        role: defaultRole,
        type: typeDef.value,
        host: defaultRole === 'gateway' ? '192.168.1.1' : '192.168.1.2',
        port: typeDef.defaultPort,
        username: typeDef.defaultUser,
        password: '',
        useHttps: false,
        pppoeInterface: 'pppoe-out1'
      });
    }
  }, [editingDevice, defaultRole, open]);

  const handleTypeChange = (newType) => {
    const found = DEVICE_TYPES.find(t => t.value === newType);
    setForm(prev => ({
      ...prev,
      type: newType,
      role: found ? found.role : prev.role,
      port: found ? found.defaultPort : prev.port,
      username: found ? found.defaultUser : prev.username
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.host.trim()) return;
    onSave({
      ...form,
      name: form.name.trim(),
      host: form.host.trim(),
      port: Number(form.port) || 80
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
          {form.role === 'gateway' ? <Shield size={22} color={theme.palette.primary.main} /> : <Wifi size={22} color={theme.palette.primary.main} />}
          {editingDevice 
            ? t('deviceDialog.editDeviceTitle', { name: editingDevice.name })
            : t('deviceDialog.addNew', { role: form.role === 'gateway' ? t('deviceDialog.gateway') : t('deviceDialog.routerMesh') })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <Alert severity="info" sx={{ py: 0.5, fontSize: '0.8rem' }}>
              {t('deviceDialog.bannerDesc')}
            </Alert>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('deviceDialog.roleLabel')}</InputLabel>
                  <Select
                    value={form.role}
                    label={t('deviceDialog.roleLabel')}
                    onChange={(e) => setForm(prev => ({ ...prev, role: e.target.value }))}
                  >
                    <MenuItem value="gateway">{t('deviceDialog.roleGatewayOption')}</MenuItem>
                    <MenuItem value="router_mesh">{t('deviceDialog.roleRouterMeshOption')}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('deviceDialog.platformBrand')}</InputLabel>
                  <Select
                    value={form.type}
                    label={t('deviceDialog.platformBrand')}
                    onChange={(e) => handleTypeChange(e.target.value)}
                  >
                    {DEVICE_TYPES.map(typeItem => (
                      <MenuItem key={typeItem.value} value={typeItem.value}>
                        {t(typeItem.key)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <TextField
              size="small"
              label={t('deviceDialog.deviceName')}
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder={t('deviceDialog.deviceNamePlaceholder')}
              required
              fullWidth
            />

            <Grid container spacing={2}>
              <Grid item xs={8}>
                <TextField
                  size="small"
                  label={t('deviceDialog.ipHost')}
                  value={form.host}
                  onChange={(e) => setForm(prev => ({ ...prev, host: e.target.value }))}
                  placeholder="192.168.1.1"
                  required
                  fullWidth
                />
              </Grid>
              <Grid item xs={4}>
                <TextField
                  size="small"
                  label={t('deviceDialog.portLabel')}
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm(prev => ({ ...prev, port: e.target.value }))}
                  placeholder="8728"
                  required
                  fullWidth
                />
              </Grid>
            </Grid>

            {form.type !== 'xiaomi' && form.type !== 'gecoos' && (
              <TextField
                size="small"
                label={t('deviceDialog.usernameLabel')}
                value={form.username}
                onChange={(e) => setForm(prev => ({ ...prev, username: e.target.value }))}
                placeholder={t('deviceDialog.usernamePlaceholder')}
                fullWidth
              />
            )}

            <TextField
              size="small"
              label={t('deviceDialog.passwordLabel')}
              type="password"
              value={form.password}
              onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))}
              placeholder={t('deviceDialog.passwordPlaceholder')}
              fullWidth
            />

            {form.type === 'mikrotik' && (
              <TextField
                size="small"
                label={t('deviceDialog.pppoeInterface')}
                value={form.pppoeInterface}
                onChange={(e) => setForm(prev => ({ ...prev, pppoeInterface: e.target.value }))}
                placeholder="pppoe-out1"
                helperText={t('deviceDialog.pppoeInterfaceHelper')}
                fullWidth
              />
            )}

            <FormControlLabel
              control={
                <Switch
                  checked={form.useHttps}
                  onChange={(e) => setForm(prev => ({ ...prev, useHttps: e.target.checked }))}
                />
              }
              label={
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {t('deviceDialog.useHttps')}
                </Typography>
              }
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="contained" color="primary" sx={{ fontWeight: 700 }}>
            {editingDevice ? t('deviceDialog.saveUpdate') : t('deviceDialog.addDevice')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
