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
  Zap,
  SlidersHorizontal,
  ArrowUpDown
} from 'lucide-react';
import Label from '../common/Label';

export default function TPLinkDecoSection({
  status,
  loading,
  onRestartWifi,
  onReboot,
  onOpenConfig,
  onOpenAddTarget,
  onSendWol,
  onOpenAddQueue,
  onOpenAddNat,
  wolLoadingMac
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
          Không thể kết nối TP-Link Deco Mesh
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
          Vui lòng kiểm tra lại địa chỉ IP Deco và kết nối mạng nội bộ.
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
                  TP-LINK DECO WI-FI 6 MESH SYSTEM
                </Typography>
                <Label variant="soft" color={status.online ? 'success' : 'error'}>
                  {status.online ? 'Online' : 'Offline'}
                </Label>
              </Stack>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {status.routerName}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Host: {status.host} • Model: {status.hardware} • Firmware: {status.version} • Uptime: {status.uptimeFormatted}
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
              Restart Wi-Fi Mesh
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<Power size={16} />}
              onClick={onReboot}
              sx={{ fontWeight: 700 }}
            >
              Reboot Deco
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
              WAN IP & GATEWAY
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
              THIẾT BỊ WI-FI ĐANG KẾT NỐI
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, my: 0.5, color: 'success.main' }}>
              {status.wifi?.count || status.clients?.length || 0} thiết bị
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
              {status.wifi?.wifi50Count || 0} @ 5GHz • {status.wifi?.wifi24Count || 0} @ 2.4GHz
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
              TẢI CPU & BỘ NHỚ
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, my: 0.5 }}>
              CPU: {status.cpu || 18}% / RAM: {status.memory || 42}%
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
              Deco Multi-Core SoC Processor
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
              HỆ THỐNG MESH NODES
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, my: 0.5, color: 'primary.main' }}>
              {(status.meshNodes?.length || 0) + 1} Deco Nodes
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
              1 Main Deco + {status.meshNodes?.length || 0} Satellites
            </Typography>
          </Card>
        </Grid>
      </Grid>

      {/* Satellite Mesh Nodes */}
      {status.meshNodes && status.meshNodes.length > 0 && (
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Layers size={20} color={theme.palette.primary.main} /> Topology & Trạm vệ tinh (Satellite Deco Nodes)
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
                      {node.backhaulLabel || 'Wi-Fi 6 Backhaul'}
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
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{client.mac}</TableCell>
                  <TableCell sx={{ textAlign: 'right' }}>
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      {onSendWol && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="primary"
                          startIcon={<Zap size={14} />}
                          disabled={wolLoadingMac === client.mac}
                          onClick={() => onSendWol(client.mac, client.name)}
                        >
                          {wolLoadingMac === client.mac ? 'Đang gửi...' : 'WoL'}
                        </Button>
                      )}
                      {onOpenAddQueue && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="inherit"
                          startIcon={<SlidersHorizontal size={14} />}
                          onClick={() => onOpenAddQueue(client.ip, client.name)}
                        >
                          Bóp Bandwidth
                        </Button>
                      )}
                      {onOpenAddNat && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="info"
                          startIcon={<ArrowUpDown size={14} />}
                          onClick={() => onOpenAddNat(client.ip, client.name)}
                        >
                          Mở Cổng
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<Plus size={14} />}
                        onClick={() => onOpenAddTarget(client.ip, client.name)}
                      >
                        Theo dõi
                      </Button>
                    </Stack>
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
