import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Grid,
  Card,
  CardHeader,
  CardContent,
  Stack,
  Typography,
  LinearProgress,
  Divider,
  Button,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Cpu,
  HardDrive,
  Clock,
  Network,
  Thermometer,
  Zap,
  CheckCircle2,
  XCircle,
  Database,
  Activity,
  Server
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import { apiRequest } from '../utils/api';
import {
  formatBytes,
  formatTemperature,
  formatWatts,
  formatUptime,
  formatDateTime
} from '../utils/formatters';
import Label from '../components/common/Label';
import Chart from '../components/chart/Chart';

const TIME_RANGES = [
  { value: '60m', labelVi: '60 phút', labelEn: '60m', ms: 60 * 60 * 1000, limit: 120, format: 'time' },
  { value: '8h', labelVi: '8 tiếng', labelEn: '8h', ms: 8 * 60 * 60 * 1000, limit: 500, format: 'time' },
  { value: '24h', labelVi: '1 ngày', labelEn: '24h', ms: 24 * 60 * 60 * 1000, limit: 1000, format: 'dateTimeShort' },
  { value: '7d', labelVi: '1 tuần', labelEn: '7d', ms: 7 * 24 * 60 * 60 * 1000, limit: 2000, format: 'dateTimeShort' },
  { value: '30d', labelVi: '1 tháng', labelEn: '30d', ms: 30 * 24 * 60 * 60 * 1000, limit: 3000, format: 'date' }
];

export default function DashboardView() {
  const theme = useTheme();
  const isLight = theme.palette.mode === 'light';
  const { lang, t } = useLanguage();
  const { isSuperAdmin, user } = useAuth();
  const { selectedHost, selectedHostId, telemetryMap } = useWebSocket();

  const canViewPower = isSuperAdmin || user?.permissions?.metrics?.power !== false;
  const canViewTemp = isSuperAdmin || user?.permissions?.metrics?.temperature !== false;
  const canViewSmart = isSuperAdmin || user?.permissions?.metrics?.smart !== false;

  const [timeRange, setTimeRange] = useState('60m');
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const telemetry = useMemo(() => {
    return (selectedHostId ? telemetryMap[selectedHostId] : null) || selectedHost?.telemetry || {};
  }, [selectedHostId, telemetryMap, selectedHost]);

  useEffect(() => {
    if (!selectedHostId) return;

    let isMounted = true;
    const currentRange = TIME_RANGES.find((r) => r.value === timeRange) || TIME_RANGES[0];

    async function loadTelemetry() {
      setLoadingHistory(true);
      try {
        const from = new Date(Date.now() - currentRange.ms).toISOString();
        const data = await apiRequest(`/api/v1/hosts/${selectedHostId}/telemetry?from=${from}&limit=${currentRange.limit}`);
        if (isMounted) {
          setHistoryData(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Failed to load telemetry history:', err);
      } finally {
        if (isMounted) setLoadingHistory(false);
      }
    }

    loadTelemetry();
    const interval = setInterval(loadTelemetry, timeRange === '60m' ? 15000 : 60000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedHostId, timeRange]);

  // CPU
  const cpuUsage = Number(telemetry.cpu?.usage ?? 0);

  // Memory
  const memTotal = telemetry.memory?.total ?? telemetry.memory?.totalBytes ?? 0;
  const memUsed = telemetry.memory?.used ?? telemetry.memory?.usedBytes ?? 0;
  const memPercent = Number(telemetry.memory?.percent ?? (memTotal > 0 ? ((memUsed / memTotal) * 100).toFixed(1) : 0));
  const memUsedStr = memUsed > 0 ? formatBytes(memUsed) : '--';
  const memTotalStr = memTotal > 0 ? formatBytes(memTotal) : '--';

  // Uptime
  const uptimeSeconds = telemetry.uptime ?? telemetry.system?.uptimeSeconds ?? 0;
  const uptimeStr = uptimeSeconds ? formatUptime(uptimeSeconds, lang) : '--';

  // OS
  const osStr = telemetry.os || telemetry.system?.platform || selectedHost?.platform || 'Windows';

  // Network
  const netSendRate = telemetry.network?.sentPerSecond ?? telemetry.network?.bytesSentRate ?? 0;
  const netRecvRate = telemetry.network?.recvPerSecond ?? telemetry.network?.bytesRecvRate ?? 0;
  const netSendStr = formatBytes(netSendRate);
  const netRecvStr = formatBytes(netRecvRate);

  // Hardware: Power & Temperatures
  const hardware = telemetry.hardware || telemetry.hardwareSensors || {};
  const temperatures = Array.isArray(hardware.temperatures)
    ? hardware.temperatures
    : Array.isArray(hardware.sensors)
    ? hardware.sensors.filter((s) => Number.isFinite(s.celsius))
    : [];

  const powerParts = Array.isArray(hardware.power?.parts)
    ? hardware.power.parts
    : Array.isArray(hardware.sensors)
    ? hardware.sensors.filter((s) => Number.isFinite(s.watts))
    : [];

  const hottestSensor = temperatures.reduce((curr, s) => (!curr || Number(s.celsius) > Number(curr.celsius) ? s : curr), null);
  const tempVal = hottestSensor?.celsius ?? null;
  const tempSensorName = hottestSensor?.name || (tempVal !== null ? 'Cảm biến nhiệt độ' : t('dashboard.sensorUnavailable'));

  function cleanPower(val) {
    if (val === null || val === undefined) return 0;
    let num = Number(val);
    if (!Number.isFinite(num) || num <= 0) return 0;
    if (num > 1000 && num <= 2000000) num = num / 1000;
    if (num > 2500) return 0;
    return num;
  }

  const rawPowerWatts = hardware.power?.totalWatts ?? (powerParts.length > 0 ? powerParts.reduce((sum, p) => sum + Number(p.watts || 0), 0) : null);
  const powerWatts = rawPowerWatts !== null ? cleanPower(rawPowerWatts) : null;
  const powerDetailStr = powerParts.length > 0
    ? t('dashboard.powerPartsMeasured', { count: powerParts.length })
    : (Number.isFinite(powerWatts) ? 'Công suất hệ thống' : t('dashboard.sensorUnavailable'));

  // Disks & S.M.A.R.T Physical Disks
  const rawDisks = telemetry.disk || telemetry.disks || [];
  const disks = Array.isArray(rawDisks) ? rawDisks : [];
  const physicalDisks = Array.isArray(telemetry.physicalDisks) ? telemetry.physicalDisks : [];

  // All sensors for display
  const allSensors = temperatures.length > 0 || powerParts.length > 0
    ? [
        ...temperatures.map((item) => ({ name: item.name, type: item.type || 'temperature', source: item.source || 'sensor', celsius: item.celsius, watts: null })),
        ...powerParts.map((item) => ({ name: item.name, type: item.type || 'power', source: item.source || 'sensor', celsius: null, watts: item.watts }))
      ]
    : Array.isArray(hardware.sensors) ? hardware.sensors : [];

  // Downsample data points for smooth chart rendering (max ~80 points)
  const currentRangeObj = TIME_RANGES.find((r) => r.value === timeRange) || TIME_RANGES[0];
  const maxChartPoints = 80;
  const chartPoints = historyData.length <= maxChartPoints
    ? historyData
    : historyData.filter((_, idx) => idx % Math.ceil(historyData.length / maxChartPoints) === 0);

  // Chart preparation
  const chartTimestamps = chartPoints.map((item) => {
    const d = new Date(item.timestamp);
    if (isNaN(d.getTime())) return '';
    if (currentRangeObj.format === 'time') {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
    }
    if (currentRangeObj.format === 'dateTimeShort') {
      return d.toLocaleDateString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
    }
    return d.toLocaleDateString([], { month: 'numeric', day: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
  });

  // Identify CPU temperature sensors
  const cpuSensors = useMemo(() => {
    let list = temperatures.filter(
      (s) => s.type === 'cpu' || /cpu|core|package|peci/i.test(s.name || '')
    );
    if (list.length === 0 && temperatures.length > 0) {
      list = [temperatures[0]];
    }
    return list;
  }, [temperatures]);

  const cpuTempCharts = useMemo(() => {
    return cpuSensors.map((sensor, sensorIdx) => {
      const sensorName = sensor.name || (cpuSensors.length > 1 ? `CPU #${sensorIdx + 1}` : 'CPU');
      const maxSeries = chartPoints.map((item) => {
        const itemTemps = Array.isArray(item.hardware?.temperatures)
          ? item.hardware.temperatures
          : Array.isArray(item.hardware?.sensors)
          ? item.hardware.sensors.filter((s) => Number.isFinite(s.celsius))
          : [];
        const match = itemTemps.find((s) => s.name === sensor.name) || itemTemps[sensorIdx] || itemTemps[0];
        const val = match?.max ?? match?.celsius ?? sensor.celsius;
        return Number.isFinite(Number(val)) ? Number(val).toFixed(1) : '0';
      });
      const minSeries = chartPoints.map((item) => {
        const itemTemps = Array.isArray(item.hardware?.temperatures)
          ? item.hardware.temperatures
          : Array.isArray(item.hardware?.sensors)
          ? item.hardware.sensors.filter((s) => Number.isFinite(s.celsius))
          : [];
        const match = itemTemps.find((s) => s.name === sensor.name) || itemTemps[sensorIdx] || itemTemps[0];
        const val = match?.min ?? match?.celsius ?? sensor.celsius;
        return Number.isFinite(Number(val)) ? Number(val).toFixed(1) : '0';
      });

      return {
        id: `cpu_temp_${sensorIdx}`,
        name: sensorName,
        currentCelsius: sensor.celsius ?? null,
        series: [
          { name: `${sensorName} Max (°C)`, data: maxSeries },
          { name: `${sensorName} Min (°C)`, data: minSeries }
        ]
      };
    });
  }, [cpuSensors, chartPoints]);

  const powerChartSeries = useMemo(() => {
    const maxData = chartPoints.map((item) => {
      const hw = item.hardware || item.hardwareSensors || {};
      const parts = Array.isArray(hw.power?.parts) ? hw.power.parts : [];
      const rawVal = hw.power?.max ?? hw.power?.totalWatts ?? (parts.length > 0 ? parts.reduce((sum, p) => sum + Number(p.watts || 0), 0) : 0);
      return cleanPower(rawVal).toFixed(1);
    });
    const minData = chartPoints.map((item) => {
      const hw = item.hardware || item.hardwareSensors || {};
      const parts = Array.isArray(hw.power?.parts) ? hw.power.parts : [];
      const rawVal = hw.power?.min ?? hw.power?.totalWatts ?? (parts.length > 0 ? parts.reduce((sum, p) => sum + Number(p.watts || 0), 0) : 0);
      return cleanPower(rawVal).toFixed(1);
    });
    return [
      { name: 'Công suất Max (W)', data: maxData },
      { name: 'Công suất Min (W)', data: minData }
    ];
  }, [chartPoints]);

  const chartCpuSeries = useMemo(() => [
    { name: 'CPU Max (Đỉnh %)', data: chartPoints.map((item) => Number(item.cpu?.max ?? item.cpu?.usage ?? 0).toFixed(1)) },
    { name: 'CPU Min (Đáy %)', data: chartPoints.map((item) => Number(item.cpu?.min ?? item.cpu?.usage ?? 0).toFixed(1)) }
  ], [chartPoints]);

  const chartMemSeries = useMemo(() => [
    { name: 'RAM Max (Đỉnh %)', data: chartPoints.map((item) => Number(item.memory?.max ?? item.memory?.percent ?? 0).toFixed(1)) },
    { name: 'RAM Min (Đáy %)', data: chartPoints.map((item) => Number(item.memory?.min ?? item.memory?.percent ?? 0).toFixed(1)) }
  ], [chartPoints]);

  const cpuChartOptions = useMemo(() => ({
    colors: [theme.palette.primary.main, theme.palette.info.main],
    stroke: { curve: 'smooth', width: [2.5, 1.5] },
    xaxis: { categories: chartTimestamps, labels: { rotate: -30, rotateAlways: chartPoints.length > 20 } },
    yaxis: { min: 0, max: 100, labels: { formatter: (v) => `${v}%` } },
    tooltip: { y: { formatter: (v) => `${v}%` } }
  }), [theme.palette.primary.main, theme.palette.info.main, chartTimestamps, chartPoints.length]);

  const memChartOptions = useMemo(() => ({
    colors: [theme.palette.info.main, theme.palette.primary.light],
    stroke: { curve: 'smooth', width: [2.5, 1.5] },
    xaxis: { categories: chartTimestamps, labels: { rotate: -30, rotateAlways: chartPoints.length > 20 } },
    yaxis: { min: 0, max: 100, labels: { formatter: (v) => `${v}%` } },
    tooltip: { y: { formatter: (v) => `${v}%` } }
  }), [theme.palette.info.main, theme.palette.primary.light, chartTimestamps, chartPoints.length]);

  const tempChartOptions = useMemo(() => ({
    colors: [theme.palette.warning.main, theme.palette.info.main],
    stroke: { curve: 'smooth', width: [2.5, 1.5] },
    xaxis: { categories: chartTimestamps, labels: { rotate: -30, rotateAlways: chartPoints.length > 20 } },
    yaxis: { min: 0, max: 100, labels: { formatter: (v) => `${v}°C` } },
    tooltip: { y: { formatter: (v) => `${v}°C` } }
  }), [theme.palette.warning.main, theme.palette.info.main, chartTimestamps, chartPoints.length]);

  const powerChartOptions = useMemo(() => ({
    colors: [theme.palette.error.main, theme.palette.warning.main],
    stroke: { curve: 'smooth', width: [2.5, 1.5] },
    xaxis: { categories: chartTimestamps, labels: { rotate: -30, rotateAlways: chartPoints.length > 20 } },
    yaxis: { min: 0, labels: { formatter: (v) => `${v} W` } },
    tooltip: { y: { formatter: (v) => `${v} W` } }
  }), [theme.palette.error.main, theme.palette.warning.main, chartTimestamps, chartPoints.length]);

  if (!selectedHost) {
    return (
      <Card sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
        <Server size={44} color={theme.palette.text.disabled} />
        <Typography variant="h6" sx={{ mt: 2, fontWeight: 700 }}>
          {t('host.none')}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('machine.waiting')}
        </Typography>
      </Card>
    );
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 1600, mx: 'auto' }}>
      {/* Hero Identity Banner */}
      <Card
        sx={{
          p: { xs: 2.25, sm: 3 },
          mb: 3,
          background: isLight
            ? `linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, #FFFFFF 100%)`
            : `linear-gradient(135deg, rgba(16, 185, 129, 0.14) 0%, #111827 100%)`,
          border: `1px solid ${isLight ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.25)'}`
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          alignItems={{ xs: 'flex-start', md: 'center' }}
          justifyContent="space-between"
        >
          {/* Identity Left */}
          <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
            <Box
              sx={{
                width: { xs: 48, sm: 56 },
                height: { xs: 48, sm: 56 },
                borderRadius: 2,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                fontWeight: 800,
                fontSize: { xs: '1.2rem', sm: '1.4rem' },
                flexShrink: 0
              }}
            >
              {selectedHost.displayName?.slice(0, 2).toUpperCase() || 'WC'}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" noWrap sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: '0.08em', display: 'block', fontSize: '0.65rem' }}>
                CONTROLLED HOST / LIVE
              </Typography>
              <Typography variant="h4" noWrap sx={{ fontWeight: 800, fontSize: { xs: '1.25rem', sm: '1.65rem' }, letterSpacing: '-0.02em' }}>
                {selectedHost.displayName || selectedHost.hostname}
              </Typography>
              <Typography variant="body2" noWrap sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.8rem' }}>
                {selectedHost.hostname} • {selectedHost.platform || 'Windows'} ({selectedHost.version || 'Agent'})
              </Typography>
            </Box>
          </Stack>

          {/* Identity Right: Status & Quick stats */}
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flexShrink: 0, flexWrap: 'wrap', gap: 1 }}>
            <Label
              variant="filled"
              color={selectedHost.online ? 'success' : 'error'}
              startIcon={
                selectedHost.online ? (
                  <Box
                    sx={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      bgcolor: '#FFFFFF',
                      boxShadow: '0 0 0 2px rgba(255,255,255,0.4)'
                    }}
                  />
                ) : (
                  <XCircle size={13} />
                )
              }
              sx={{ py: 0.6, px: 1.25, fontSize: '0.75rem', fontWeight: 700 }}
            >
              {selectedHost.online ? t('common.online') : t('common.offline')}
            </Label>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem' }}>
              {selectedHost.lastSeen ? formatDateTime(selectedHost.lastSeen, lang) : t('dashboard.waiting')}
            </Typography>
          </Stack>
        </Stack>
      </Card>

      {/* 6 Metric Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Metric 1: CPU */}
        <Grid item xs={6} sm={6} md={4} lg={2}>
          <Card sx={{ p: 2, height: 1, overflow: 'hidden' }}>
            <Stack spacing={0.6}>
              <Box sx={{ color: 'primary.main' }}><Cpu size={18} /></Box>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('dashboard.cpuLoad')}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>{cpuUsage.toFixed(1)}%</Typography>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                {telemetry.cpu?.model || t('dashboard.waiting')}
              </Typography>
            </Stack>
          </Card>
        </Grid>

        {/* Metric 2: Memory */}
        <Grid item xs={6} sm={6} md={4} lg={2}>
          <Card sx={{ p: 2, height: 1, overflow: 'hidden' }}>
            <Stack spacing={0.6}>
              <Box sx={{ color: 'info.main' }}><HardDrive size={18} /></Box>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('dashboard.memory')}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>{memPercent.toFixed(1)}%</Typography>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                {memUsedStr} / {memTotalStr}
              </Typography>
            </Stack>
          </Card>
        </Grid>

        {/* Metric 3: Uptime */}
        <Grid item xs={6} sm={6} md={4} lg={2}>
          <Card sx={{ p: 2, height: 1, overflow: 'hidden' }}>
            <Stack spacing={0.6}>
              <Box sx={{ color: 'success.main' }}><Clock size={18} /></Box>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('dashboard.uptime')}</Typography>
              <Typography variant="subtitle1" noWrap sx={{ fontWeight: 800, letterSpacing: '-0.01em' }}>{uptimeStr}</Typography>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                {osStr}
              </Typography>
            </Stack>
          </Card>
        </Grid>

        {/* Metric 4: Network */}
        <Grid item xs={6} sm={6} md={4} lg={2}>
          <Card sx={{ p: 2, height: 1, overflow: 'hidden' }}>
            <Stack spacing={0.6}>
              <Box sx={{ color: 'secondary.main' }}><Network size={18} /></Box>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('dashboard.network')}</Typography>
              <Typography variant="subtitle1" noWrap sx={{ fontWeight: 800, letterSpacing: '-0.01em' }}>↑{netSendStr}/s</Typography>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                ↓{netRecvStr}/s
              </Typography>
            </Stack>
          </Card>
        </Grid>

        {/* Metric 5: Temperature (Only if sensor exists and user has permission) */}
        {canViewTemp && Number.isFinite(tempVal) && tempVal > 0 && (
          <Grid item xs={6} sm={6} md={4} lg={2}>
            <Card sx={{ p: 2, height: 1, overflow: 'hidden' }}>
              <Stack spacing={0.6}>
                <Box sx={{ color: 'warning.main' }}><Thermometer size={18} /></Box>
                <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('dashboard.temperature')}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>{formatTemperature(tempVal)}</Typography>
                <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  {tempSensorName}
                </Typography>
              </Stack>
            </Card>
          </Grid>
        )}

        {/* Metric 6: Power (Only if sensor exists and user has permission) */}
        {canViewPower && Number.isFinite(powerWatts) && powerWatts > 0 && (
          <Grid item xs={6} sm={6} md={4} lg={2}>
            <Card sx={{ p: 2, height: 1, overflow: 'hidden' }}>
              <Stack spacing={0.6}>
                <Box sx={{ color: 'error.main' }}><Zap size={18} /></Box>
                <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('dashboard.power')}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>{formatWatts(powerWatts)}</Typography>
                <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  {powerDetailStr}
                </Typography>
              </Stack>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* Trends Section Header with Time Range Selector */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        alignItems={{ xs: 'flex-start', md: 'center' }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1, letterSpacing: '-0.015em' }}>
            <Activity size={18} color={theme.palette.primary.main} /> {t('dashboard.trends') || 'Biểu đồ tài nguyên'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
            {loadingHistory ? 'Đang tải dữ liệu lịch sử...' : `Khoảng thời gian: ${lang === 'vi' ? currentRangeObj.labelVi : currentRangeObj.labelEn} (${chartPoints.length} điểm mẫu)`}
          </Typography>
        </Box>

        <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          {TIME_RANGES.map((range) => {
            const active = timeRange === range.value;
            return (
              <Button
                key={range.value}
                size="small"
                variant={active ? 'contained' : 'outlined'}
                color={active ? 'primary' : 'inherit'}
                onClick={() => setTimeRange(range.value)}
                sx={{
                  py: 0.4,
                  px: 1.25,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  borderRadius: 1.5,
                  minWidth: 'auto'
                }}
              >
                {lang === 'vi' ? range.labelVi : range.labelEn}
              </Button>
            );
          })}
        </Stack>
      </Stack>

      {/* Real-time Charts Grid */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {/* CPU Usage Chart */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader
              title={t('dashboard.cpuTrend')}
              subheader={lang === 'vi' ? `Khoảng thời gian: ${currentRangeObj.labelVi}` : `Range: ${currentRangeObj.labelEn}`}
              titleTypographyProps={{ typography: 'subtitle1', fontWeight: 700 }}
              action={
                <Label variant="soft" color="primary">
                  {cpuUsage.toFixed(1)}% Live
                </Label>
              }
            />
            <CardContent sx={{ pt: 0.5, pb: 2 }}>
              <Chart type="area" series={chartCpuSeries} options={cpuChartOptions} height={240} />
            </CardContent>
          </Card>
        </Grid>

        {/* RAM Usage Chart */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader
              title={t('dashboard.memoryTrend')}
              subheader={lang === 'vi' ? `Khoảng thời gian: ${currentRangeObj.labelVi}` : `Range: ${currentRangeObj.labelEn}`}
              titleTypographyProps={{ typography: 'subtitle1', fontWeight: 700 }}
              action={
                <Label variant="soft" color="info">
                  {memPercent.toFixed(1)}% Live
                </Label>
              }
            />
            <CardContent sx={{ pt: 0.5, pb: 2 }}>
              <Chart type="area" series={chartMemSeries} options={memChartOptions} height={240} />
            </CardContent>
          </Card>
        </Grid>

        {/* Dynamic CPU Temperature Charts */}
        {canViewTemp && cpuTempCharts.length > 0 && cpuTempCharts.some(c => Number.isFinite(c.currentCelsius) && c.currentCelsius > 0) && cpuTempCharts.map((tempChart) => (
          <Grid item xs={12} md={6} key={tempChart.id}>
            <Card>
              <CardHeader
                title={tempChart.name.includes('CPU') ? tempChart.name : `Nhiệt độ ${tempChart.name}`}
                subheader={lang === 'vi' ? `Khoảng thời gian: ${currentRangeObj.labelVi}` : `Range: ${currentRangeObj.labelEn}`}
                titleTypographyProps={{ typography: 'subtitle1', fontWeight: 700 }}
                action={
                  <Label variant="soft" color={tempChart.currentCelsius > 75 ? 'error' : tempChart.currentCelsius > 60 ? 'warning' : 'success'}>
                    {tempChart.currentCelsius !== null ? `${Number(tempChart.currentCelsius).toFixed(1)}°C Live` : '--'}
                  </Label>
                }
              />
              <CardContent sx={{ pt: 0.5, pb: 2 }}>
                <Chart type="area" series={tempChart.series} options={tempChartOptions} height={240} />
              </CardContent>
            </Card>
          </Grid>
        ))}

        {/* Total Power Consumption Chart */}
        {canViewPower && Number.isFinite(powerWatts) && powerWatts > 0 && (
          <Grid item xs={12} md={6}>
            <Card>
              <CardHeader
                title={t('dashboard.powerTrend')}
                subheader={lang === 'vi' ? `Khoảng thời gian: ${currentRangeObj.labelVi}` : `Range: ${currentRangeObj.labelEn}`}
                titleTypographyProps={{ typography: 'subtitle1', fontWeight: 700 }}
                action={
                  <Label variant="soft" color="error">
                    {powerWatts !== null ? `${Number(powerWatts).toFixed(1)} W Live` : '--'}
                  </Label>
                }
              />
              <CardContent sx={{ pt: 0.5, pb: 2 }}>
                <Chart type="area" series={powerChartSeries} options={powerChartOptions} height={240} />
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* Storage & Machine Identity & Sensors Grid */}
      <Grid container spacing={2.5}>
        {/* Storage / Fixed Disks */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: 1 }}>
            <CardHeader
              title={t('dashboard.storage')}
              subheader={t('dashboard.fixedDisks')}
              titleTypographyProps={{ typography: 'subtitle1', fontWeight: 700 }}
            />
            <CardContent>
              {disks.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('dashboard.noDisks')}
                </Typography>
              ) : (
                <Stack spacing={2}>
                  {disks.map((disk, idx) => {
                    const diskTotal = Number(disk.total || disk.totalBytes || 0);
                    const diskUsed = Number(disk.used || (disk.total && disk.free ? disk.total - disk.free : 0) || (disk.totalBytes && disk.freeBytes ? disk.totalBytes - disk.freeBytes : 0));
                    const percent = diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0;
                    const usedStr = formatBytes(diskUsed);
                    const totalStr = formatBytes(diskTotal);

                    return (
                      <Box key={idx}>
                        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Database size={15} /> Ổ đĩa {disk.drive || disk.mount || disk.device || `#${idx + 1}`}
                          </Typography>
                          <Typography variant="caption" sx={{ fontWeight: 700 }}>
                            {usedStr} / {totalStr} ({percent}%)
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={percent}
                          sx={{
                            height: 7,
                            borderRadius: 3.5,
                            '& .MuiLinearProgress-bar': {
                              bgcolor: percent > 90 ? 'error.main' : percent > 75 ? 'warning.main' : 'primary.main',
                              borderRadius: 3.5
                            }
                          }}
                        />
                      </Box>
                    );
                  })}

                  {/* S.M.A.R.T Physical Disks Health */}
                  {canViewSmart && physicalDisks.length > 0 && (
                    <Box sx={{ mt: 2, pt: 2, borderTop: `1px dashed ${theme.palette.divider}` }}>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 1.5, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        SỨC KHỎE Ổ CỨNG VẬT LÝ (S.M.A.R.T)
                      </Typography>
                      <Stack spacing={1.25}>
                        {physicalDisks.map((pDisk, pIdx) => {
                          const healthPercent = typeof pDisk.healthPercent === 'number'
                            ? Math.max(0, Math.min(100, Math.round(pDisk.healthPercent)))
                            : (pDisk.healthStatus === 'Healthy' || pDisk.operationalStatus === 'OK' ? 100 : 50);

                          let healthColor = 'success';
                          if (healthPercent < 60 || pDisk.healthStatus === 'Unhealthy') healthColor = 'error';
                          else if (healthPercent < 90 || pDisk.healthStatus === 'Warning') healthColor = 'warning';

                          return (
                            <Box
                              key={pIdx}
                              sx={{
                                p: 1.5,
                                borderRadius: 2,
                                bgcolor: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${theme.palette.divider}`
                              }}
                            >
                              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                                <Box sx={{ minWidth: 0, mr: 1 }}>
                                  <Typography variant="subtitle2" noWrap sx={{ fontWeight: 800, fontSize: '0.8125rem' }}>
                                    {pDisk.name}
                                  </Typography>
                                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                    {pDisk.mediaType || 'Disk'} • {pDisk.busType || 'NVMe/SATA'} • {formatBytes(pDisk.size)}
                                    {pDisk.temperature ? ` • 🌡️ ${pDisk.temperature}°C` : ''}
                                    {pDisk.powerOnHours ? ` • ⏱️ ${pDisk.powerOnHours.toLocaleString()}h chạy` : ''}
                                    {typeof pDisk.wearPercent === 'number' ? ` • Hao mòn: ${pDisk.wearPercent}%` : ''}
                                  </Typography>
                                </Box>
                                <Label color={healthColor} sx={{ fontWeight: 800 }}>
                                  {healthPercent}% Sức khỏe
                                </Label>
                              </Stack>

                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box sx={{ flexGrow: 1 }}>
                                  <LinearProgress
                                    variant="determinate"
                                    value={healthPercent}
                                    color={healthColor}
                                    sx={{ height: 6, borderRadius: 3 }}
                                  />
                                </Box>
                                <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 32, textAlign: 'right', color: `${healthColor}.main` }}>
                                  {healthPercent}%
                                </Typography>
                              </Box>
                            </Box>
                          );
                        })}
                      </Stack>
                    </Box>
                  )}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Machine Identity Specs */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: 1 }}>
            <CardHeader
              title={t('dashboard.identity')}
              titleTypographyProps={{ typography: 'subtitle1', fontWeight: 700 }}
            />
            <CardContent>
              <Stack spacing={1.75}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('machine.displayName')}:</Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{selectedHost.displayName}</Typography>
                </Stack>
                <Divider />
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('machine.hostname')}:</Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{selectedHost.hostname}</Typography>
                </Stack>
                <Divider />
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('machine.platform')}:</Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{selectedHost.platform || 'Windows'}</Typography>
                </Stack>
                <Divider />
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('machine.agentVersion')}:</Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{selectedHost.version || 'v1.0.0'}</Typography>
                </Stack>
                <Divider />
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('machine.fingerprint')}:</Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {selectedHost.fingerprint || '--'}
                  </Typography>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Hardware Sensors Grid */}
        {allSensors.length > 0 && (canViewPower || canViewTemp) && (
          <Grid item xs={12}>
            <Card>
              <CardHeader
                title={t('dashboard.hardwareSensors')}
                subheader={t('dashboard.hardwarePartial')}
                titleTypographyProps={{ typography: 'subtitle1', fontWeight: 700 }}
              />
              <CardContent>
                <Grid container spacing={1.5}>
                  {allSensors
                    .filter((sensor) => {
                      if (Number.isFinite(sensor.watts) && !canViewPower) return false;
                      if (Number.isFinite(sensor.celsius) && !canViewTemp) return false;
                      return true;
                    })
                    .map((sensor, idx) => (
                      <Grid item xs={12} sm={6} md={4} lg={3} key={idx}>
                        <Box
                          sx={{
                            p: 1.75,
                            borderRadius: 2,
                            bgcolor: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${theme.palette.divider}`
                          }}
                        >
                          <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                            {sensor.name || `Sensor #${idx + 1}`}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1, fontSize: '0.7rem' }}>
                            {sensor.type} • {sensor.source}
                          </Typography>
                          <Stack direction="row" spacing={0.75}>
                            {canViewTemp && Number.isFinite(sensor.celsius) && (
                              <Label variant="soft" color="warning" startIcon={<Thermometer size={11} />} sx={{ fontSize: '0.7rem' }}>
                                {formatTemperature(sensor.celsius)}
                              </Label>
                            )}
                            {canViewPower && Number.isFinite(sensor.watts) && (
                              <Label variant="soft" color="error" startIcon={<Zap size={11} />} sx={{ fontSize: '0.7rem' }}>
                                {formatWatts(sensor.watts)}
                              </Label>
                            )}
                          </Stack>
                        </Box>
                      </Grid>
                    ))}
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}

