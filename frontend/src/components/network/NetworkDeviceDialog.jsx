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
  { value: 'mikrotik', labelVi: 'MikroTik RouterOS (Gateway)', labelEn: 'MikroTik RouterOS (Gateway)', role: 'gateway', defaultPort: 8728, defaultUser: 'admin' },
  { value: 'openwrt', labelVi: 'OpenWrt / ImmortalWrt (Gateway / Router)', labelEn: 'OpenWrt / ImmortalWrt (Gateway / Router)', role: 'gateway', defaultPort: 80, defaultUser: 'root' },
  { value: 'zte', labelVi: 'ZTE EasyMesh / ONT (H196A, F670L, H3601...)', labelEn: 'ZTE EasyMesh / ONT (H196A, F670L, H3601...)', role: 'router_mesh', defaultPort: 80, defaultUser: 'admin' },
  { value: 'tplink_deco', labelVi: 'TP-Link Deco Mesh (Wi-Fi System)', labelEn: 'TP-Link Deco Mesh (Wi-Fi System)', role: 'router_mesh', defaultPort: 80, defaultUser: 'admin' },
  { value: 'xiaomi', labelVi: 'Xiaomi Mesh / MiWiFi (AP)', labelEn: 'Xiaomi Mesh / MiWiFi (AP)', role: 'router_mesh', defaultPort: 80, defaultUser: 'admin' },
  { value: 'gecoos', labelVi: 'Gecoos Enterprise AP', labelEn: 'Gecoos Enterprise AP', role: 'router_mesh', defaultPort: 80, defaultUser: 'admin' },
  { value: 'generic', labelVi: 'Thiết bị Router / Gateway khác (Ping)', labelEn: 'Other Router / Gateway Device (Ping)', role: 'router_mesh', defaultPort: 80, defaultUser: 'admin' }
];

export default function NetworkDeviceDialog({ open, onClose, onSave, editingDevice, defaultRole = 'gateway' }) {
  const theme = useTheme();
  const { lang } = useLanguage();

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
            ? (lang === 'vi' ? `Chỉnh sửa thiết bị: ${editingDevice.name}` : `Edit Device: ${editingDevice.name}`)
            : (lang === 'vi' ? `Thêm thiết bị ${form.role === 'gateway' ? 'Gateway' : 'Router & Mesh'} mới` : `Add New ${form.role === 'gateway' ? 'Gateway' : 'Router & Mesh'} Device`)}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <Alert severity="info" sx={{ py: 0.5, fontSize: '0.8rem' }}>
              {lang === 'vi' 
                ? 'Hỗ trợ quản trị tập trung MikroTik RouterOS (API Socket 8728/8729 & REST), OpenWrt / ImmortalWrt (ubus/LuCI), TP-Link Deco, Xiaomi Mesh và Gecoos AP.'
                : 'Supports centralized management for MikroTik RouterOS (API Socket 8728/8729 & REST), OpenWrt / ImmortalWrt (ubus/LuCI), TP-Link Deco, Xiaomi Mesh, and Gecoos AP.'}
            </Alert>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>{lang === 'vi' ? 'Vai trò thiết bị' : 'Device Role'}</InputLabel>
                  <Select
                    value={form.role}
                    label={lang === 'vi' ? 'Vai trò thiết bị' : 'Device Role'}
                    onChange={(e) => setForm(prev => ({ ...prev, role: e.target.value }))}
                  >
                    <MenuItem value="gateway">{lang === 'vi' ? 'Core Gateway (Router biên / Quay PPPoE)' : 'Core Gateway (Border Router / PPPoE)'}</MenuItem>
                    <MenuItem value="router_mesh">{lang === 'vi' ? 'Router & Wi-Fi Mesh (Điểm phát AP)' : 'Router & Wi-Fi Mesh (AP / Mesh)'}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>{lang === 'vi' ? 'Hãng / Nền tảng' : 'Platform / Brand'}</InputLabel>
                  <Select
                    value={form.type}
                    label={lang === 'vi' ? 'Hãng / Nền tảng' : 'Platform / Brand'}
                    onChange={(e) => handleTypeChange(e.target.value)}
                  >
                    {DEVICE_TYPES.map(t => (
                      <MenuItem key={t.value} value={t.value}>
                        {lang === 'vi' ? t.labelVi : t.labelEn}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <TextField
              size="small"
              label={lang === 'vi' ? 'Tên thiết bị (Gợi nhớ)' : 'Device Name'}
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder={lang === 'vi' ? 'VD: MikroTik RB5009, OpenWrt Tầng 1, Deco X50...' : 'e.g. MikroTik RB5009, OpenWrt Core, Deco X50...'}
              required
              fullWidth
            />

            <Grid container spacing={2}>
              <Grid item xs={8}>
                <TextField
                  size="small"
                  label={lang === 'vi' ? 'Địa chỉ IP (Host)' : 'IP Address (Host)'}
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
                  label={lang === 'vi' ? 'Cổng (Port)' : 'Port'}
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
                label={lang === 'vi' ? 'Tên tài khoản (Username)' : 'Username'}
                value={form.username}
                onChange={(e) => setForm(prev => ({ ...prev, username: e.target.value }))}
                placeholder={lang === 'vi' ? 'admin hoặc root' : 'admin or root'}
                fullWidth
              />
            )}

            <TextField
              size="small"
              label={lang === 'vi' ? 'Mật khẩu quản trị (Password / Token)' : 'Admin Password / Token'}
              type="password"
              value={form.password}
              onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))}
              placeholder={lang === 'vi' ? 'Để trống nếu không đặt mật khẩu' : 'Leave empty if no password'}
              fullWidth
            />

            {form.type === 'mikrotik' && (
              <TextField
                size="small"
                label={lang === 'vi' ? 'Tên cổng PPPoE (Interface WAN)' : 'PPPoE Interface Name (WAN)'}
                value={form.pppoeInterface}
                onChange={(e) => setForm(prev => ({ ...prev, pppoeInterface: e.target.value }))}
                placeholder="pppoe-out1"
                helperText={lang === 'vi' ? 'Dùng cho tính năng làm mới IP WAN và đo băng thông realtime' : 'Used for WAN IP renewal and realtime bandwidth monitoring'}
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
                  {lang === 'vi' ? 'Sử dụng kết nối bảo mật SSL / HTTPS' : 'Use secure SSL / HTTPS connection'}
                </Typography>
              }
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={onClose}>{lang === 'vi' ? 'Hủy' : 'Cancel'}</Button>
          <Button type="submit" variant="contained" color="primary" sx={{ fontWeight: 700 }}>
            {editingDevice ? (lang === 'vi' ? 'Lưu cập nhật' : 'Save Changes') : (lang === 'vi' ? 'Thêm thiết bị' : 'Add Device')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
