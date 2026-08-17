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
  { value: '30d', labelVi: '1 tháng', labelEn: '30d', ms: 30 * 24 * 60 * 60 * 1000, limit: 3000, format: 'date' },
  { value: '6M', labelVi: '6 tháng', labelEn: '6M', ms: 180 * 24 * 60 * 60 * 1000, limit: 4000, format: 'date' },
  { value: '1y', labelVi: '1 năm', labelEn: '1y', ms: 365 * 24 * 60 * 60 * 1000, limit: 5000, format: 'date' }
];

export default function DashboardView() {
  const theme = useTheme();
  const { lang, t } = useLanguage();
  const { selectedHost, selectedHostId, telemetryMap } = useWebSocket();

  const [timeRange, setTimeRange] = useState('60m');
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const telemetry = useMemo(() => {
    return (selectedHostId ? telemetryMap[selectedHostId] : null) || selectedHost?.telemetry || {};
  }, [selectedHostId, telemetryMap, selectedHost]);

  // Fetch telemetry history based on selected timeRange
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
  const cpuModel = telemetry.cpu?.model || telemetry.cpu?.name || t('dashboard.waiting');

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
  const osStr = telemetry.os || telemetry.system?.platform || selectedHost.platform || 'Windows';

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

  const powerWatts = hardware.power?.totalWatts ?? (powerParts.length > 0 ? powerParts.reduce((sum, p) => sum + Number(p.watts || 0), 0) : null);
  const powerDetailStr = powerParts.length > 0
    ? t('dashboard.powerPartsMeasured', { count: powerParts.length })
    : (Number.isFinite(powerWatts) ? 'Công suất hệ thống' : t('dashboard.sensorUnavailable'));

  // Disks
  const rawDisks = telemetry.disk || telemetry.disks || [];
  const disks = Array.isArray(rawDisks) ? rawDisks : [];

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
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (currentRangeObj.format === 'dateTimeShort') {
      return `${d.getDate()}/${d.getMonth() + 1} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return `${d.getDate()}/${d.getMonth() + 1}`;
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

  // Build series for each CPU temperature sensor (e.g. 2 for dual Xeon)
  const cpuTempCharts = useMemo(() => {
    return cpuSensors.map((sensor, sensorIdx) => {
      const sensorName = sensor.name || (cpuSensors.length > 1 ? `CPU #${sensorIdx + 1}` : 'CPU');
      const seriesData = chartPoints.map((item) => {
        const itemTemps = Array.isArray(item.hardware?.temperatures)
          ? item.hardware.temperatures
          : Array.isArray(item.hardware?.sensors)
          ? item.hardware.sensors.filter((s) => Number.isFinite(s.celsius))
          : [];
        const match = itemTemps.find((s) => s.name === sensor.name) || itemTemps[sensorIdx] || itemTemps[0];
        return match && Number.isFinite(match.celsius) ? Number(match.celsius).toFixed(1) : (sensor.celsius ? Number(sensor.celsius).toFixed(1) : '0');
      });

      return {
        id: `cpu_temp_${sensorIdx}`,
        name: sensorName,
        currentCelsius: sensor.celsius ?? null,
        series: [{ name: `${sensorName} (°C)`, data: seriesData }]
      };
    });
  }, [cpuSensors, chartPoints]);

  // Build Total Power series
  const powerChartSeries = useMemo(() => {
    const seriesData = chartPoints.map((item) => {
      const hw = item.hardware || item.hardwareSensors || {};
      const parts = Array.isArray(hw.power?.parts) ? hw.power.parts : [];
      const val = hw.power?.totalWatts ?? (parts.length > 0 ? parts.reduce((sum, p) => sum + Number(p.watts || 0), 0) : 0);
      return Number(val || 0).toFixed(1);
    });
    return [{ name: 'Công suất (W)', data: seriesData }];
  }, [chartPoints]);

  const chartCpuSeries = [{ name: 'CPU %', data: chartPoints.map((item) => Number(item.cpu?.usage || 0).toFixed(1)) }];
  const chartMemSeries = [{ name: 'RAM %', data: chartPoints.map((item) => Number(item.memory?.percent || 0).toFixed(1)) }];

  const cpuChartOptions = {
    colors: [theme.palette.primary.main],
    xaxis: { categories: chartTimestamps, labels: { rotate: -30, rotateAlways: chartPoints.length > 20 } },
    yaxis: { min: 0, max: 100, labels: { formatter: (v) => `${v}%` } },
    tooltip: { y: { formatter: (v) => `${v}%` } }
  };

  const memChartOptions = {
    colors: [theme.palette.info.main],
    xaxis: { categories: chartTimestamps, labels: { rotate: -30, rotateAlways: chartPoints.length > 20 } },
    yaxis: { min: 0, max: 100, labels: { formatter: (v) => `${v}%` } },
    tooltip: { y: { formatter: (v) => `${v}%` } }
  };

  const tempChartOptions = {
    colors: [theme.palette.warning.main],
    xaxis: { categories: chartTimestamps, labels: { rotate: -30, rotateAlways: chartPoints.length > 20 } },
    yaxis: { min: 0, max: 100, labels: { formatter: (v) => `${v}°C` } },
    tooltip: { y: { formatter: (v) => `${v}°C` } }
  };

  const powerChartOptions = {
    colors: [theme.palette.error.main],
    xaxis: { categories: chartTimestamps, labels: { rotate: -30, rotateAlways: chartPoints.length > 20 } },
    yaxis: { min: 0, labels: { formatter: (v) => `${v} W` } },
    tooltip: { y: { formatter: (v) => `${v} W` } }
  };

  if (!selectedHost) {
    return (
      <Card sx={{ p: 6, textAlign: 'center' }}>
        <Server size={48} color={theme.palette.text.disabled} />
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
    <Box>
      {/* Hero Identity Banner */}
      <Card
        sx={{
          p: { xs: 2.5, sm: 3.5 },
          mb: 4,
          background: theme.palette.mode === 'light'
            ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${theme.palette.background.paper} 100%)`
            : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.16)} 0%, ${theme.palette.background.paper} 100%)`
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2.5}
          alignItems={{ xs: 'flex-start', md: 'center' }}
          justifyContent="space-between"
        >
          {/* Identity Left */}
          <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
            <Box
              sx={{
                width: { xs: 52, sm: 64 },
                height: { xs: 52, sm: 64 },
                borderRadius: 2.5,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: theme.customShadows.primary,
                fontWeight: 800,
                fontSize: { xs: '1.25rem', sm: '1.6rem' },
                flexShrink: 0
              }}
            >
              {selectedHost.displayName?.slice(0, 2).toUpperCase() || 'WC'}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" noWrap sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: 1, display: 'block', fontSize: '0.7rem' }}>
                CONTROLLED HOST / LIVE
              </Typography>
              <Typography variant="h4" noWrap sx={{ fontWeight: 800, fontSize: { xs: '1.35rem', sm: '2rem' } }}>
                {selectedHost.displayName || selectedHost.hostname}
              </Typography>
              <Typography variant="body2" noWrap sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.8rem' }}>
                {selectedHost.hostname} • {selectedHost.platform || 'Windows'} ({selectedHost.version || 'Agent'})
              </Typography>
            </Box>
          </Stack>

          {/* Identity Right: Status & Quick stats */}
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexShrink: 0, flexWrap: 'wrap', gap: 1 }}>
            <Label
              variant="filled"
              color={selectedHost.online ? 'success' : 'error'}
              startIcon={selectedHost.online ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              sx={{ py: 0.75, px: 1.25, fontSize: '0.8125rem' }}
            >
              {selectedHost.online ? t('common.online') : t('common.offline')}
            </Label>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              {selectedHost.lastSeen ? formatDateTime(selectedHost.lastSeen, lang) : t('dashboard.waiting')}
            </Typography>
          </Stack>
        </Stack>
      </Card>

      {/* 6 Metric Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {/* Metric 1: CPU */}
        <Grid item xs={6} sm={6} md={4} lg={2}>
          <Card sx={{ p: 2, height: 1, overflow: 'hidden' }}>
            <Stack spacing={0.75}>
              <Box sx={{ color: 'primary.main' }}><Cpu size={20} /></Box>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.7rem' }}>{t('dashboard.cpuLoad')}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>{cpuUsage.toFixed(1)}%</Typography>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                {telemetry.cpu?.model || t('dashboard.waiting')}
              </Typography>
            </Stack>
          </Card>
        </Grid>

        {/* Metric 2: Memory */}
        <Grid item xs={6} sm={6} md={4} lg={2}>
          <Card sx={{ p: 2, height: 1, overflow: 'hidden' }}>
            <Stack spacing={0.75}>
              <Box sx={{ color: 'info.main' }}><HardDrive size={20} /></Box>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.7rem' }}>{t('dashboard.memory')}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>{memPercent.toFixed(1)}%</Typography>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                {memUsedStr} / {memTotalStr}
              </Typography>
            </Stack>
          </Card>
        </Grid>

        {/* Metric 3: Uptime */}
        <Grid item xs={6} sm={6} md={4} lg={2}>
          <Card sx={{ p: 2, height: 1, overflow: 'hidden' }}>
            <Stack spacing={0.75}>
              <Box sx={{ color: 'success.main' }}><Clock size={20} /></Box>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.7rem' }}>{t('dashboard.uptime')}</Typography>
              <Typography variant="subtitle1" noWrap sx={{ fontWeight: 800 }}>{uptimeStr}</Typography>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                {osStr}
              </Typography>
            </Stack>
          </Card>
        </Grid>

        {/* Metric 4: Network */}
        <Grid item xs={6} sm={6} md={4} lg={2}>
          <Card sx={{ p: 2, height: 1, overflow: 'hidden' }}>
            <Stack spacing={0.75}>
              <Box sx={{ color: 'secondary.main' }}><Network size={20} /></Box>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.7rem' }}>{t('dashboard.network')}</Typography>
              <Typography variant="subtitle1" noWrap sx={{ fontWeight: 800 }}>↑{netSendStr}/s</Typography>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                ↓{netRecvStr}/s
              </Typography>
            </Stack>
          </Card>
        </Grid>

        {/* Metric 5: Temperature */}
        <Grid item xs={6} sm={6} md={4} lg={2}>
          <Card sx={{ p: 2, height: 1, overflow: 'hidden' }}>
            <Stack spacing={0.75}>
              <Box sx={{ color: 'warning.main' }}><Thermometer size={20} /></Box>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.7rem' }}>{t('dashboard.temperature')}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>{formatTemperature(tempVal)}</Typography>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                {tempSensorName}
              </Typography>
            </Stack>
          </Card>
        </Grid>

        {/* Metric 6: Power */}
        <Grid item xs={6} sm={6} md={4} lg={2}>
          <Card sx={{ p: 2, height: 1, overflow: 'hidden' }}>
            <Stack spacing={0.75}>
              <Box sx={{ color: 'error.main' }}><Zap size={20} /></Box>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.7rem' }}>{t('dashboard.power')}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>{formatWatts(powerWatts)}</Typography>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                {powerDetailStr}
              </Typography>
            </Stack>
          </Card>
        </Grid>
      </Grid>

      {/* Trends Section Header with Time Range Selector */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        alignItems={{ xs: 'flex-start', md: 'center' }}
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 2.5 }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Activity size={20} color={theme.palette.primary.main} /> {t('dashboard.trends') || 'Biểu đồ tài nguyên'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
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
                  py: 0.5,
                  px: 1.25,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  borderRadius: 1.5,
                  minWidth: 'auto',
                  bgcolor: active ? undefined : alpha(theme.palette.grey[500], 0.06),
                  borderColor: active ? undefined : alpha(theme.palette.grey[500], 0.24)
                }}
              >
                {lang === 'vi' ? range.labelVi : range.labelEn}
              </Button>
            );
          })}
        </Stack>
      </Stack>

      {/* Real-time Charts Grid */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* CPU Usage Chart */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader
              title={t('dashboard.cpuTrend')}
              subheader={lang === 'vi' ? `Khoảng thời gian: ${currentRangeObj.labelVi}` : `Range: ${currentRangeObj.labelEn}`}
              titleTypographyProps={{ typography: 'h6', fontWeight: 700 }}
              action={
                <Label variant="soft" color="primary">
                  {cpuUsage.toFixed(1)}% Live
                </Label>
              }
            />
            <CardContent sx={{ pt: 1, pb: 2 }}>
              <Chart type="area" series={chartCpuSeries} options={cpuChartOptions} height={250} />
            </CardContent>
          </Card>
        </Grid>

        {/* RAM Usage Chart */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader
              title={t('dashboard.memoryTrend')}
              subheader={lang === 'vi' ? `Khoảng thời gian: ${currentRangeObj.labelVi}` : `Range: ${currentRangeObj.labelEn}`}
              titleTypographyProps={{ typography: 'h6', fontWeight: 700 }}
              action={
                <Label variant="soft" color="info">
                  {memPercent.toFixed(1)}% Live
                </Label>
              }
            />
            <CardContent sx={{ pt: 1, pb: 2 }}>
              <Chart type="area" series={chartMemSeries} options={memChartOptions} height={250} />
            </CardContent>
          </Card>
        </Grid>

        {/* Dynamic CPU Temperature Charts (1 for single CPU, 2 for dual Xeon) */}
        {cpuTempCharts.map((tempChart) => (
          <Grid item xs={12} md={6} key={tempChart.id}>
            <Card>
              <CardHeader
                title={tempChart.name.includes('CPU') ? tempChart.name : `Nhiệt độ ${tempChart.name}`}
                subheader={lang === 'vi' ? `Khoảng thời gian: ${currentRangeObj.labelVi}` : `Range: ${currentRangeObj.labelEn}`}
                titleTypographyProps={{ typography: 'h6', fontWeight: 700 }}
                action={
                  <Label variant="soft" color={tempChart.currentCelsius > 75 ? 'error' : tempChart.currentCelsius > 60 ? 'warning' : 'success'}>
                    {tempChart.currentCelsius !== null ? `${Number(tempChart.currentCelsius).toFixed(1)}°C Live` : '--'}
                  </Label>
                }
              />
              <CardContent sx={{ pt: 1, pb: 2 }}>
                <Chart type="area" series={tempChart.series} options={tempChartOptions} height={250} />
              </CardContent>
            </Card>
          </Grid>
        ))}

        {/* Total Power Consumption Chart */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader
              title={t('dashboard.powerTrend')}
              subheader={lang === 'vi' ? `Khoảng thời gian: ${currentRangeObj.labelVi}` : `Range: ${currentRangeObj.labelEn}`}
              titleTypographyProps={{ typography: 'h6', fontWeight: 700 }}
              action={
                <Label variant="soft" color="error">
                  {powerWatts !== null ? `${Number(powerWatts).toFixed(1)} W Live` : '--'}
                </Label>
              }
            />
            <CardContent sx={{ pt: 1, pb: 2 }}>
              <Chart type="area" series={powerChartSeries} options={powerChartOptions} height={250} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Storage & Machine Identity & Sensors Grid */}
      <Grid container spacing={3}>
        {/* Storage / Fixed Disks */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: 1 }}>
            <CardHeader
              title={t('dashboard.storage')}
              subheader={t('dashboard.fixedDisks')}
              titleTypographyProps={{ typography: 'h6', fontWeight: 700 }}
            />
            <CardContent>
              {disks.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('dashboard.noDisks')}
                </Typography>
              ) : (
                <Stack spacing={2.5}>
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
                            <Database size={16} /> Ổ đĩa {disk.drive || disk.mount || disk.device || `#${idx + 1}`}
                          </Typography>
                          <Typography variant="caption" sx={{ fontWeight: 700 }}>
                            {usedStr} / {totalStr} ({percent}%)
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={percent}
                          sx={{
                            height: 8,
                            borderRadius: 4,
                            bgcolor: alpha(theme.palette.grey[500], 0.16),
                            '& .MuiLinearProgress-bar': {
                              bgcolor: percent > 90 ? 'error.main' : percent > 75 ? 'warning.main' : 'primary.main',
                              borderRadius: 4
                            }
                          }}
                        />
                      </Box>
                    );
                  })}
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
              titleTypographyProps={{ typography: 'h6', fontWeight: 700 }}
            />
            <CardContent>
              <Stack spacing={2}>
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

        {/* Hardware Sensors Grid if present */}
        {allSensors.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardHeader
                title={t('dashboard.hardwareSensors')}
                subheader={t('dashboard.hardwarePartial')}
                titleTypographyProps={{ typography: 'h6', fontWeight: 700 }}
              />
              <CardContent>
                <Grid container spacing={2}>
                  {allSensors.map((sensor, idx) => (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={idx}>
                      <Box
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          bgcolor: alpha(theme.palette.grey[500], 0.08),
                          border: `1px solid ${theme.palette.divider}`
                        }}
                      >
                        <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
                          {sensor.name || `Sensor #${idx + 1}`}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                          {sensor.type} • {sensor.source}
                        </Typography>
                        <Stack direction="row" spacing={1}>
                          {Number.isFinite(sensor.celsius) && (
                            <Label variant="soft" color="warning" startIcon={<Thermometer size={12} />}>
                              {formatTemperature(sensor.celsius)}
                            </Label>
                          )}
                          {Number.isFinite(sensor.watts) && (
                            <Label variant="soft" color="error" startIcon={<Zap size={12} />}>
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
