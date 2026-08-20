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

const DEVICE_TYPES = [
  { value: 'mikrotik', label: 'MikroTik RouterOS (Gateway)', role: 'gateway', defaultPort: 8728, defaultUser: 'admin' },
  { value: 'openwrt', label: 'OpenWrt / ImmortalWrt (Gateway / Router)', role: 'gateway', defaultPort: 80, defaultUser: 'root' },
  { value: 'zte', label: 'ZTE EasyMesh / ONT (H196A, F670L, H3601...)', role: 'router_mesh', defaultPort: 80, defaultUser: 'admin' },
  { value: 'tplink_deco', label: 'TP-Link Deco Mesh (Wi-Fi System)', role: 'router_mesh', defaultPort: 80, defaultUser: 'admin' },
  { value: 'xiaomi', label: 'Xiaomi Mesh / MiWiFi (AP)', role: 'router_mesh', defaultPort: 80, defaultUser: 'admin' },
  { value: 'gecoos', label: 'Gecoos Enterprise AP', role: 'router_mesh', defaultPort: 80, defaultUser: 'admin' },
  { value: 'generic', label: 'Thiết bị Router / Gateway khác (Ping)', role: 'router_mesh', defaultPort: 80, defaultUser: 'admin' }
];

export default function NetworkDeviceDialog({ open, onClose, onSave, editingDevice, defaultRole = 'gateway' }) {
  const theme = useTheme();

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
          {editingDevice ? `Chỉnh sửa thiết bị: ${editingDevice.name}` : `Thêm thiết bị ${form.role === 'gateway' ? 'Gateway' : 'Router & Mesh'} mới`}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <Alert severity="info" sx={{ py: 0.5, fontSize: '0.8rem' }}>
              Hỗ trợ quản trị tập trung MikroTik RouterOS (API Socket 8728/8729 & REST), OpenWrt / ImmortalWrt (ubus/LuCI), TP-Link Deco, Xiaomi Mesh và Gecoos AP.
            </Alert>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Vai trò thiết bị</InputLabel>
                  <Select
                    value={form.role}
                    label="Vai trò thiết bị"
                    onChange={(e) => setForm(prev => ({ ...prev, role: e.target.value }))}
                  >
                    <MenuItem value="gateway">Core Gateway (Router biên / Quay PPPoE)</MenuItem>
                    <MenuItem value="router_mesh">Router & Wi-Fi Mesh (Điểm phát AP)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Hãng / Nền tảng (Platform)</InputLabel>
                  <Select
                    value={form.type}
                    label="Hãng / Nền tảng (Platform)"
                    onChange={(e) => handleTypeChange(e.target.value)}
                  >
                    {DEVICE_TYPES.map(t => (
                      <MenuItem key={t.value} value={t.value}>
                        {t.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <TextField
              size="small"
              label="Tên thiết bị (Gợi nhớ)"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="VD: MikroTik RB5009, OpenWrt Tầng 1, Deco X50..."
              required
              fullWidth
            />

            <Grid container spacing={2}>
              <Grid item xs={8}>
                <TextField
                  size="small"
                  label="Địa chỉ IP (Host)"
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
                  label="Cổng dịch vụ (Port)"
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
                label="Tên tài khoản (Username)"
                value={form.username}
                onChange={(e) => setForm(prev => ({ ...prev, username: e.target.value }))}
                placeholder="admin hoặc root"
                fullWidth
              />
            )}

            <TextField
              size="small"
              label="Mật khẩu quản trị (Password / Token)"
              type="password"
              value={form.password}
              onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))}
              placeholder="Để trống nếu không đặt mật khẩu"
              fullWidth
            />

            {form.type === 'mikrotik' && (
              <TextField
                size="small"
                label="Tên cổng PPPoE (Interface WAN)"
                value={form.pppoeInterface}
                onChange={(e) => setForm(prev => ({ ...prev, pppoeInterface: e.target.value }))}
                placeholder="pppoe-out1"
                helperText="Dùng cho tính năng làm mới IP WAN và đo băng thông realtime"
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
                  Sử dụng kết nối bảo mật SSL / HTTPS
                </Typography>
              }
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={onClose}>Hủy</Button>
          <Button type="submit" variant="contained" color="primary" sx={{ fontWeight: 700 }}>
            {editingDevice ? 'Lưu cập nhật' : 'Thêm thiết bị'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
