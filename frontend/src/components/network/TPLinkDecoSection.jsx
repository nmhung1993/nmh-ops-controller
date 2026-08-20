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
  const { lang, t } = useLanguage();

  if (loading && !status) {
    return <LinearProgress sx={{ my: 4, borderRadius: 2 }} />;
  }

  if (!status) {
    return (
      <Card sx={{ p: 4, textAlign: 'center' }}>
        <Wifi size={48} color={theme.palette.text.disabled} />
        <Typography variant="h6" sx={{ mt: 2, fontWeight: 700 }}>
          {t('deco.cannotConnect', { host: '' })}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
          {t('deco.checkCredentials')}
        </Typography>
        <Button variant="contained" startIcon={<Settings size={16} />} onClick={onOpenConfig}>
          {t('deco.configure')}
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
                  {t('deco.title')}
                </Typography>
                <Label variant="soft" color={status.online ? 'success' : 'error'} sx={{ height: 20, fontSize: '0.65rem' }}>
                  {status.online ? 'Online' : 'Offline'}
                </Label>
              </Stack>
              <Typography variant="h6" sx={{ fontWeight: 800, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                {status.routerName}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', fontSize: '0.72rem' }}>
                Host: {status.host} • Model: {status.hardware} • Firmware: {status.version} • Uptime: {status.uptimeFormatted}
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
              {t('deco.restartMesh')}
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<Power size={14} />}
              onClick={onReboot}
              sx={{ fontWeight: 700, fontSize: '0.75rem', py: 0.5 }}
            >
              {t('network.reboot')}
            </Button>
            <Button
              size="small"
              variant="contained"
              color="inherit"
              startIcon={<Settings size={14} />}
              onClick={onOpenConfig}
              sx={{ fontWeight: 700, fontSize: '0.75rem', py: 0.5 }}
            >
              {t('network.config')}
            </Button>
          </Stack>
        </Stack>
      </Card>

      {/* Telemetry Cards (2x2 on Mobile) */}
      <Grid container spacing={{ xs: 1, sm: 2 }}>
        <Grid item xs={6} sm={6} md={3}>
          <Card sx={{ p: { xs: 1.25, sm: 2 }, height: '100%', borderRadius: 2 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: { xs: '0.6rem', sm: '0.7rem' } }}>
              WAN IP & GATEWAY
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
              {t('network.totalWifiClients')}
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, my: 0.25, color: 'success.main', fontSize: { xs: '0.875rem', sm: '1.1rem' } }}>
              {status.wifi?.count || status.clients?.length || 0} {t('common.devices')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', display: 'block' }} noWrap>
              {status.wifi?.wifi50Count || 0} @ 5G • {status.wifi?.wifi24Count || 0} @ 2.4G
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={3}>
          <Card sx={{ p: { xs: 1.25, sm: 2 }, height: '100%', borderRadius: 2 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: { xs: '0.6rem', sm: '0.7rem' } }}>
              {t('network.apCpuLoad')} & {t('network.ramAp')}
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, my: 0.25, fontSize: { xs: '0.85rem', sm: '1.05rem' } }} noWrap>
              C: {status.cpu || 18}% / R: {status.memory || 42}%
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', display: 'block' }} noWrap>
              Multi-Core SoC
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={3}>
          <Card sx={{ p: { xs: 1.25, sm: 2 }, height: '100%', borderRadius: 2 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: { xs: '0.6rem', sm: '0.7rem' } }}>
              {t('network.secondaryMeshNodes')}
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, my: 0.25, color: 'primary.main', fontSize: { xs: '0.875rem', sm: '1.1rem' } }}>
              {(status.meshNodes?.length || 0) + 1} Deco Nodes
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', display: 'block' }} noWrap>
              1 Main + {status.meshNodes?.length || 0} Satellites
            </Typography>
          </Card>
        </Grid>
      </Grid>


      {/* Satellite Mesh Nodes */}
      {status.meshNodes && status.meshNodes.length > 0 && (
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Layers size={20} color={theme.palette.primary.main} /> {t('deco.meshTopology', { count: status.meshNodes.length + 1 })}
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
                        {t('network.apCpuLoad')}
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        {node.cpu}%
                      </Typography>
                    </Box>
                    <Divider orientation="vertical" flexItem />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {t('network.ramAp')}
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        {node.memory}%
                      </Typography>
                    </Box>
                    <Divider orientation="vertical" flexItem />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {t('network.wifiClients')}
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main' }}>
                        {node.clientCount} {t('common.devices')}
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
          {t('deco.clientsTableTitle', { count: status.clients?.length || 0 })}
        </Typography>

        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>{t('network.deviceName')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t('network.ipAddress')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t('network.band')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t('network.macAddress')}</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>{t('network.actions')}</TableCell>
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
                          {wolLoadingMac === client.mac ? t('network.sending') : t('network.wol')}
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
                          {t('network.limit')}
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
                          {t('network.openPort')}
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<Plus size={14} />}
                        onClick={() => onOpenAddTarget(client.ip, client.name)}
                      >
                        {t('network.monitor')}
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
