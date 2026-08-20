import React from 'react';
import {
  Box,
  Card,
  Grid,
  Stack,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Divider,
  LinearProgress,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Server,
  Globe,
  RefreshCw,
  Power,
  Settings,
  Cpu,
  HardDrive,
  Users,
  Clock,
  Zap,
  Activity,
  Plus
} from 'lucide-react';
import Label from '../common/Label';

export default function OpenWrtSection({
  status,
  loading,
  onRestartNetwork,
  onReboot,
  onOpenConfig,
  onOpenAddTarget
}) {
  const theme = useTheme();

  if (loading && !status) {
    return <LinearProgress sx={{ my: 4, borderRadius: 2 }} />;
  }

  if (!status) {
    return (
      <Card sx={{ p: 4, textAlign: 'center' }}>
        <Server size={48} color={theme.palette.text.disabled} />
        <Typography variant="h6" sx={{ mt: 2, fontWeight: 700 }}>
          Không thể kết nối OpenWrt Gateway
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
          Vui lòng kiểm tra lại địa chỉ IP, cổng HTTP (80/443) và mật khẩu ubus / LuCI RPC.
        </Typography>
        <Button variant="contained" startIcon={<Settings size={16} />} onClick={onOpenConfig}>
          Cấu hình kết nối
        </Button>
      </Card>
    );
  }

  return (
    <Stack spacing={3}>
      {/* Banner */}
      <Card
        sx={{
          p: 3,
          background: `linear-gradient(135deg, ${alpha(theme.palette.info.main, 0.1)} 0%, ${theme.palette.background.paper} 100%)`
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center" justifyContent="space-between" spacing={2.5}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 2.5,
                bgcolor: 'info.main',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Server size={32} />
            </Box>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="overline" sx={{ color: 'info.main', fontWeight: 800, letterSpacing: 1 }}>
                  OPENWRT / IMMORTALWRT CORE ROUTER
                </Typography>
                <Label variant="soft" color={status.online ? 'success' : 'error'}>
                  {status.online ? 'Online' : 'Offline'}
                </Label>
                {status.isApiConnected && <Label variant="soft" color="primary">LuCI ubus RPC OK</Label>}
              </Stack>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {status.routerName}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Host: {status.host} • Model: {status.hardware} • Version: {status.version} • Uptime: {status.uptimeFormatted}
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button
              variant="outlined"
              color="warning"
              startIcon={<RefreshCw size={16} />}
              onClick={onRestartNetwork}
              sx={{ fontWeight: 700 }}
            >
              Làm mới mạng (Restart Network)
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<Power size={16} />}
              onClick={onReboot}
              sx={{ fontWeight: 700 }}
            >
              Reboot Router
            </Button>
            <Button
              variant="contained"
              color="inherit"
              startIcon={<Settings size={16} />}
              onClick={onOpenConfig}
              sx={{ fontWeight: 700 }}
            >
              Cấu hình
            </Button>
          </Stack>
        </Stack>
      </Card>

      {/* Telemetry Cards */}
      <Grid container spacing={2.5}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
              WAN IPV4 & GATEWAY
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, my: 0.5, color: 'primary.main', fontFamily: 'monospace' }}>
              {status.wan?.ip || '--'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
              GW: {status.wan?.gateway || '192.168.1.1'} • DNS: {status.wan?.dns || '8.8.8.8'}
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
              TẢI CPU HỆ THỐNG
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, my: 0.5, color: status.cpu > 80 ? 'error.main' : 'text.primary' }}>
              {status.cpu}%
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
              Load Average Linux ({status.cpuCount || 4} Cores)
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
              BỘ NHỚ RAM (LUCI)
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, my: 0.5 }}>
              {status.memory}%
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
              {status.memoryFreeMb || 256} MB còn trống / {status.memoryTotalMb || 512} MB
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
              DHCP LEASES (MÁY TRẠM)
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, my: 0.5, color: 'info.main' }}>
              {status.dhcpLeases?.length || 0} thiết bị
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
              Cấp phát động qua dnsmasq
            </Typography>
          </Card>
        </Grid>
      </Grid>

      {/* DHCP Leases Table */}
      <Card sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
          Danh sách cấp phát IP DHCP Leases ({status.dhcpLeases?.length || 0})
        </Typography>

        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Địa chỉ IP</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Tên thiết bị (Hostname)</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>MAC Address</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Thời hạn thuê (Expires)</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Thao tác</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(status.dhcpLeases || []).map((lease, idx) => (
                <TableRow key={lease.id || idx}>
                  <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{lease.ip}</TableCell>
                  <TableCell>{lease.hostname || 'Thiết bị LAN'}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{lease.mac}</TableCell>
                  <TableCell>
                    <Label variant="soft" color="info">
                      {lease.expiresAfter || 'Hợp lệ'}
                    </Label>
                  </TableCell>
                  <TableCell sx={{ textAlign: 'right' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Plus size={14} />}
                      onClick={() => onOpenAddTarget(lease.ip, lease.hostname)}
                    >
                      Theo dõi
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Stack>
  );
}
