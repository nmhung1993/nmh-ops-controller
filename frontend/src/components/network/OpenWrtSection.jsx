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
  Plus,
  SlidersHorizontal,
  ArrowUpDown
} from 'lucide-react';
import Label from '../common/Label';
import { useLanguage } from '../../context/LanguageContext';

export default function OpenWrtSection({
  status,
  loading,
  onRestartNetwork,
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
        <Server size={48} color={theme.palette.text.disabled} />
        <Typography variant="h6" sx={{ mt: 2, fontWeight: 700 }}>
          {t('openwrt.cannotConnect', { host: '' })}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
          {t('openwrt.checkCredentials')}
        </Typography>
        <Button variant="contained" startIcon={<Settings size={16} />} onClick={onOpenConfig}>
          {t('openwrt.configure')}
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
          background: `linear-gradient(135deg, ${alpha(theme.palette.info.main, 0.1)} 0%, ${theme.palette.background.paper} 100%)`,
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
                bgcolor: 'info.main',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Server size={26} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={0.75} alignItems="center" justifyContent={{ xs: 'center', sm: 'flex-start' }} sx={{ flexWrap: 'wrap', gap: 0.5, mb: 0.25 }}>
                <Typography variant="overline" sx={{ color: 'info.main', fontWeight: 800, letterSpacing: 0.5, fontSize: '0.65rem', lineHeight: 1.2 }}>
                  {t('openwrt.title')}
                </Typography>
                <Label variant="soft" color={status.online ? 'success' : 'error'} sx={{ height: 20, fontSize: '0.65rem' }}>
                  {status.online ? 'Online' : 'Offline'}
                </Label>
                {status.isApiConnected && <Label variant="soft" color="primary" sx={{ height: 20, fontSize: '0.65rem' }}>LuCI ubus RPC OK</Label>}
              </Stack>
              <Typography variant="h6" sx={{ fontWeight: 800, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                {status.routerName}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', fontSize: '0.72rem' }}>
                Host: {status.host} • Model: {status.hardware} • Version: {status.version} • Uptime: {status.uptimeFormatted}
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.75, justifyContent: { xs: 'center', md: 'flex-end' }, width: { xs: '100%', md: 'auto' } }}>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={<RefreshCw size={14} />}
              onClick={onRestartNetwork}
              sx={{ fontWeight: 700, fontSize: '0.75rem', py: 0.5 }}
            >
              {t('openwrt.restartNetwork')}
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
              WAN IPV4 & GATEWAY
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
              {t('network.routerCpuLoad')}
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, my: 0.25, color: status.cpu > 80 ? 'error.main' : 'text.primary', fontSize: { xs: '0.875rem', sm: '1.1rem' } }}>
              {status.cpu}%
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', display: 'block' }} noWrap>
              {status.cpuCount || 4} Cores Linux
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={3}>
          <Card sx={{ p: { xs: 1.25, sm: 2 }, height: '100%', borderRadius: 2 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: { xs: '0.6rem', sm: '0.7rem' } }}>
              {t('network.ramMemory')}
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, my: 0.25, fontSize: { xs: '0.875rem', sm: '1.1rem' } }}>
              {status.memory}%
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', display: 'block' }} noWrap>
              {status.memoryFreeMb || 256}MB / {status.memoryTotalMb || 512}MB
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={6} sm={6} md={3}>
          <Card sx={{ p: { xs: 1.25, sm: 2 }, height: '100%', borderRadius: 2 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: { xs: '0.6rem', sm: '0.7rem' } }}>
              {t('network.dhcp')}
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, my: 0.25, color: 'info.main', fontSize: { xs: '0.875rem', sm: '1.1rem' } }}>
              {status.dhcpLeases?.length || 0} {t('common.devices')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', display: 'block' }}>
              {t('openwrt.activeOnLan')}
            </Typography>
          </Card>
        </Grid>
      </Grid>

      {/* DHCP Table */}
      <Card sx={{ p: { xs: 1.5, sm: 3 }, borderRadius: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, fontSize: { xs: '0.95rem', sm: '1.15rem' } }}>
          {t('network.dhcpLeasesTitle', { count: status.dhcpLeases?.length || 0 })}
        </Typography>

        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>{t('network.ipAddress')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t('network.hostnameCol')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t('network.macAddress')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{t('network.status')}</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>{t('network.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(status.dhcpLeases || []).map((lease, idx) => (
                <TableRow key={lease.id || idx}>
                  <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{lease.ip}</TableCell>
                  <TableCell>{lease.hostname || t('network.lanDevice')}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{lease.mac}</TableCell>
                  <TableCell>
                    <Label variant="soft" color="info">
                      {lease.expiresAfter || t('common.good')}
                    </Label>
                  </TableCell>
                  <TableCell sx={{ textAlign: 'right' }}>
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      {onSendWol && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="primary"
                          startIcon={<Zap size={14} />}
                          disabled={wolLoadingMac === lease.mac}
                          onClick={() => onSendWol(lease.mac, lease.hostname)}
                        >
                          {wolLoadingMac === lease.mac ? t('network.sending') : t('network.wol')}
                        </Button>
                      )}
                      {onOpenAddQueue && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="inherit"
                          startIcon={<SlidersHorizontal size={14} />}
                          onClick={() => onOpenAddQueue(lease.ip, lease.hostname)}
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
                          onClick={() => onOpenAddNat(lease.ip, lease.hostname)}
                        >
                          {t('network.openPort')}
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<Plus size={14} />}
                        onClick={() => onOpenAddTarget(lease.ip, lease.hostname)}
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
