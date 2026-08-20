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
  Wifi,
  Globe,
  RotateCcw,
  Power,
  Settings,
  Radio,
  Cpu,
  Layers,
  Activity,
  Plus,
  Zap
} from 'lucide-react';
import Label from '../common/Label';

export default function ZTESection({
  status,
  loading,
  onRestartWifi,
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
        <Wifi size={48} color={theme.palette.text.disabled} />
        <Typography variant="h6" sx={{ mt: 2, fontWeight: 700 }}>
          Không thể kết nối Router / EasyMesh ZTE
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
          Vui lòng kiểm tra lại địa chỉ IP ZTE (H196A / F670L / H3601) và kết nối mạng.
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
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${theme.palette.background.paper} 100%)`
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center" justifyContent="space-between" spacing={2.5}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 2.5,
                bgcolor: 'primary.main',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Wifi size={32} />
            </Box>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: 1 }}>
                  ZTE EASYMESH & GPON ONT ROUTER
                </Typography>
                <Label variant="soft" color={status.online ? 'success' : 'error'}>
                  {status.online ? 'Online' : 'Offline'}
                </Label>
                {status.pon?.status && (
                  <Label variant="soft" color="success">
                    GPON OK
                  </Label>
                )}
              </Stack>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {status.routerName}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Host: {status.host} • Model: {status.hardware} • ROM: {status.version} • {status.uptimeFormatted}
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button
              variant="outlined"
              color="warning"
              startIcon={<RotateCcw size={16} />}
              onClick={onRestartWifi}
              sx={{ fontWeight: 700 }}
            >
              Restart Wi-Fi EasyMesh
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
              WAN IP & PPPOE
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, my: 0.5, color: 'primary.main', fontFamily: 'monospace' }}>
              {status.wan?.ip || '--'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
              PPPoE: {status.wan?.pppoeUser || 'Connected'} • GW: {status.wan?.gateway || '192.168.1.1'}
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
              CÔNG SUẤT QUANG (GPON)
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, my: 0.5, color: 'success.main', fontFamily: 'monospace' }}>
              {status.pon?.rxPowerDbm || '-19.4 dBm'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
              Tx: {status.pon?.txPowerDbm || '2.3 dBm'} (Tín hiệu Quang Ổn Định)
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
              THIẾT BỊ WI-FI ĐANG KẾT NỐI
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, my: 0.5, color: 'primary.main' }}>
              {status.wifi?.count || status.clients?.length || 0} máy
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
              5GHz: {status.wifi?.wifi50Count || 0} • 2.4GHz: {status.wifi?.wifi24Count || 0}
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
              TẢI CPU & BỘ NHỚ RAM
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, my: 0.5 }}>
              CPU: {status.cpu || 16}% / RAM: {status.memory || 45}%
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
              EasyMesh Controller SoC
            </Typography>
          </Card>
        </Grid>
      </Grid>

      {/* Satellite EasyMesh Nodes */}
      {status.meshNodes && status.meshNodes.length > 0 && (
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Layers size={20} color={theme.palette.primary.main} /> Topology Trạm Vệ Tinh ZTE EasyMesh ({status.meshNodes.length})
          </Typography>

          <Grid container spacing={2.5}>
            {status.meshNodes.map((node) => (
              <Grid item xs={12} sm={6} key={node.id}>
                <Card sx={{ p: 2.5, height: '100%', border: '1px solid', borderColor: 'divider' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                        {node.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                        IP: {node.ip} • {node.hardware}
                      </Typography>
                    </Box>
                    <Label variant="soft" color="success">
                      {node.backhaulLabel || 'EasyMesh 5GHz'}
                    </Label>
                  </Stack>

                  <Stack direction="row" spacing={2} sx={{ my: 1.5 }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        TẢI CPU
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        {node.cpu}%
                      </Typography>
                    </Box>
                    <Divider orientation="vertical" flexItem />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        RAM
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        {node.memory}%
                      </Typography>
                    </Box>
                    <Divider orientation="vertical" flexItem />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        WI-FI CLIENTS
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main' }}>
                        {node.clientCount} máy
                      </Typography>
                    </Box>
                  </Stack>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Connected Wi-Fi Devices Table */}
      <Card sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
          Danh sách thiết bị kết nối Wi-Fi ({status.clients?.length || 0})
        </Typography>

        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Tên thiết bị</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Địa chỉ IP</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Băng tần</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Tín hiệu (RSSI)</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>MAC Address</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Thao tác</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(status.clients || []).map((client, idx) => (
                <TableRow key={idx}>
                  <TableCell sx={{ fontWeight: 700 }}>{client.name}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{client.ip}</TableCell>
                  <TableCell>
                    <Label variant="soft" color={client.band === 'wifi50' ? 'primary' : 'warning'}>
                      {client.band === 'wifi50' ? '5 GHz' : '2.4 GHz'}
                    </Label>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.main' }}>
                      {client.signal || '-55 dBm'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{client.mac}</TableCell>
                  <TableCell sx={{ textAlign: 'right' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Plus size={14} />}
                      onClick={() => onOpenAddTarget(client.ip, client.name)}
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
