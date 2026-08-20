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
import { useLanguage } from '../../context/LanguageContext';

export default function ZTESection({
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
  const { lang } = useLanguage();

  if (loading && !status) {
    return <LinearProgress sx={{ my: 4, borderRadius: 2 }} />;
  }

  if (!status) {
    return (
      <Card sx={{ p: 4, textAlign: 'center' }}>
        <Wifi size={48} color={theme.palette.text.disabled} />
        <Typography variant="h6" sx={{ mt: 2, fontWeight: 700 }}>
          {lang === 'vi' ? 'Không thể kết nối Router / EasyMesh ZTE' : 'Cannot connect to ZTE Router / EasyMesh'}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
          {lang === 'vi' ? 'Vui lòng kiểm tra lại địa chỉ IP ZTE (H196A / F670L / H3601) và kết nối mạng.' : 'Please verify ZTE IP address (H196A / F670L / H3601) and network connectivity.'}
        </Typography>
        <Button variant="contained" startIcon={<Settings size={16} />} onClick={onOpenConfig}>
          {lang === 'vi' ? 'Cấu hình kết nối' : 'Configure Connection'}
        </Button>
      </Card>
    );
  }

  return (
    <Stack spacing={3}>
      {/* Banner */}
      <Card
        sx={{
          p: { xs: 1.5, sm: 2.5 },
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${theme.palette.background.paper} 100%)`,
          borderRadius: 2.5
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center" justifyContent="space-between" spacing={2} sx={{ textAlign: { xs: 'center', md: 'left' } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center" sx={{ width: { xs: '100%', md: 'auto' } }}>
            <Box
              sx={{
                width: { xs: 44, sm: 52 },
                height: { xs: 44, sm: 52 },
                borderRadius: 2,
                bgcolor: 'primary.main',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Wifi size={26} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={0.75} alignItems="center" justifyContent={{ xs: 'center', sm: 'flex-start' }} sx={{ flexWrap: 'wrap', gap: 0.5, mb: 0.25 }}>
                <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: 0.5, fontSize: '0.65rem', lineHeight: 1.2 }}>
                  ZTE EASYMESH & GPON ONT
                </Typography>
                <Label variant="soft" color={status.online ? 'success' : 'error'} sx={{ height: 20, fontSize: '0.65rem' }}>
                  {status.online ? 'Online' : 'Offline'}
                </Label>
                {status.pon?.status && (
                  <Label variant="soft" color="success" sx={{ height: 20, fontSize: '0.65rem' }}>
                    GPON OK
                  </Label>
                )}
              </Stack>
              <Typography variant="h6" sx={{ fontWeight: 800, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                {status.routerName}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', fontSize: '0.72rem' }}>
                Host: {status.host} • Model: {status.hardware} • ROM: {status.version} • {status.uptimeFormatted}
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.75, justifyContent: { xs: 'center', md: 'flex-end' }, width: { xs: '100%', md: 'auto' } }}>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={<RotateCcw size={14} />}
              onClick={onRestartWifi}
              sx={{ fontWeight: 700, fontSize: '0.75rem', py: 0.5 }}
            >
              {lang === 'vi' ? 'Làm mới Wi-Fi' : 'Restart Mesh'}
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<Power size={14} />}
              onClick={onReboot}
              sx={{ fontWeight: 700, fontSize: '0.75rem', py: 0.5 }}
            >
              Reboot Router
            </Button>
            <Button
              size="small"
              variant="contained"
              color="inherit"
              startIcon={<Settings size={14} />}
              onClick={onOpenConfig}
              sx={{ fontWeight: 700, fontSize: '0.75rem', py: 0.5 }}
            >
              {lang === 'vi' ? 'Cấu hình' : 'Config'}
            </Button>
          </Stack>
        </Stack>
      </Card>

      {/* Telemetry Cards (2x2 on Mobile) */}
      <Grid container spacing={{ xs: 1, sm: 2 }}>
        <Grid item xs={6} sm={6} md={3}>
          <Card sx={{ p: { xs: 1.25, sm: 2 }, height: '100%', borderRadius: 2 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: { xs: '0.6rem', sm: '0.7rem' } }}>
              WAN IP & PPPOE
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, my: 0.25, color: 'primary.main', fontFamily: 'monospace', fontSize: { xs: '0.875rem', sm: '1.1rem' } }} noWrap>
              {status.wan?.ip || '--'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', display: 'block' }} noWrap>
              GW: {status.wan?.gateway || '192.168.1.1'}
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={3}>
          <Card sx={{ p: { xs: 1.25, sm: 2 }, height: '100%', borderRadius: 2 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: { xs: '0.6rem', sm: '0.7rem' } }}>
              {lang === 'vi' ? 'QUANG GPON (RX)' : 'GPON OPTICAL (RX)'}
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, my: 0.25, color: 'success.main', fontFamily: 'monospace', fontSize: { xs: '0.875rem', sm: '1.1rem' } }} noWrap>
              {status.pon?.rxPowerDbm || '-19.4 dBm'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', display: 'block' }} noWrap>
              Tx: {status.pon?.txPowerDbm || '2.3 dBm'} ({lang === 'vi' ? 'Ổn định' : 'Optimal'})
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={3}>
          <Card sx={{ p: { xs: 1.25, sm: 2 }, height: '100%', borderRadius: 2 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: { xs: '0.6rem', sm: '0.7rem' } }}>
              WI-FI CLIENTS
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, my: 0.25, color: 'primary.main', fontSize: { xs: '0.875rem', sm: '1.1rem' } }}>
              {status.wifi?.count || status.clients?.length || 0} {lang === 'vi' ? 'máy' : 'devices'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', display: 'block' }} noWrap>
              5G: {status.wifi?.wifi50Count || 0} • 2.4G: {status.wifi?.wifi24Count || 0}
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={3}>
          <Card sx={{ p: { xs: 1.25, sm: 2 }, height: '100%', borderRadius: 2 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: { xs: '0.6rem', sm: '0.7rem' } }}>
              CPU & RAM ZTE
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, my: 0.25, fontSize: { xs: '0.85rem', sm: '1.05rem' } }} noWrap>
              C: {status.cpu || 16}% / R: {status.memory || 45}%
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', display: 'block' }} noWrap>
              Controller SoC
            </Typography>
          </Card>
        </Grid>
      </Grid>


      {/* Satellite EasyMesh Nodes */}
      {status.meshNodes && status.meshNodes.length > 0 && (
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Layers size={20} color={theme.palette.primary.main} /> {lang === 'vi' ? `Topology Trạm Vệ Tinh ZTE EasyMesh (${status.meshNodes.length})` : `ZTE EasyMesh Topology (${status.meshNodes.length} Nodes)`}
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
                        {lang === 'vi' ? 'TẢI CPU' : 'CPU LOAD'}
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
                        {node.clientCount} {lang === 'vi' ? 'máy' : 'devices'}
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
          {lang === 'vi' ? `Danh sách thiết bị kết nối Wi-Fi (${status.clients?.length || 0})` : `Connected Wi-Fi Devices (${status.clients?.length || 0})`}
        </Typography>

        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>{lang === 'vi' ? 'Tên thiết bị' : 'Device Name'}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{lang === 'vi' ? 'Địa chỉ IP' : 'IP Address'}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{lang === 'vi' ? 'Băng tần' : 'Band'}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{lang === 'vi' ? 'Tín hiệu (RSSI)' : 'Signal (RSSI)'}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>MAC Address</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>{lang === 'vi' ? 'Thao tác' : 'Actions'}</TableCell>
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
                          {wolLoadingMac === client.mac ? (lang === 'vi' ? 'Đang gửi...' : 'Sending...') : 'WoL'}
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
                          {lang === 'vi' ? 'Giới hạn' : 'Limit'}
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
                          {lang === 'vi' ? 'Mở Cổng' : 'Open Port'}
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<Plus size={14} />}
                        onClick={() => onOpenAddTarget(client.ip, client.name)}
                      >
                        {lang === 'vi' ? 'Theo dõi' : 'Monitor'}
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
