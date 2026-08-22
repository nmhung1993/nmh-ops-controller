import React, { useState, useMemo } from 'react';
import {
  Box,
  Card,
  CardHeader,
  CardContent,
  Grid,
  Stack,
  Typography,
  Button,
  Slider,
  Switch,
  FormControlLabel,
  Tooltip,
  Alert,
  CircularProgress,
  Divider,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Fan,
  Zap,
  Gauge,
  Sliders,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Wind,
  ShieldAlert,
  Cpu,
  Tv
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../utils/api';
import Label from '../common/Label';

export default function FanControlWidget({ host, telemetry, onFanControlled }) {
  const theme = useTheme();
  const isLight = theme.palette.mode === 'light';
  const { t } = useLanguage();
  const { isSuperAdmin, user } = useAuth();

  const canControl = isSuperAdmin || user?.role === 'admin' || user?.role === 'host_manager';
  const isOnline = Boolean(host?.online);

  // Extract fans from telemetry
  const hardware = telemetry?.hardware || telemetry?.hardwareSensors || {};
  const fans = useMemo(() => {
    if (Array.isArray(hardware.fans) && hardware.fans.length > 0) {
      return hardware.fans;
    }
    // Fallback: check if any sensor has 'Fan' or 'fan' in name/type
    if (Array.isArray(hardware.sensors)) {
      return hardware.sensors
        .filter((s) => s.type === 'fan' || /fan/i.test(s.name || ''))
        .map((s, idx) => ({
          id: `sensor-fan-${idx}`,
          name: s.name || `Fan #${idx + 1}`,
          rpm: Number.isFinite(s.rpm) ? s.rpm : (Number.isFinite(s.value) ? s.value : null),
          percent: Number.isFinite(s.percent) ? s.percent : 50,
          controlSupported: true,
          mode: 'auto',
          source: s.source || 'hardware'
        }));
    }
    return [];
  }, [hardware]);

  // Local state for fan controls: channelId -> { speed: number, mode: 'auto' | 'manual', loading: boolean }
  const [localControlState, setLocalControlState] = useState({});
  const [globalLoading, setGlobalLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState({ type: '', text: '' });

  // Get current speed for a fan
  const getFanSpeed = (fan) => {
    if (localControlState[fan.id]?.speed !== undefined) {
      return localControlState[fan.id].speed;
    }
    return fan.percent !== null && fan.percent !== undefined ? fan.percent : 50;
  };

  // Get current mode for a fan
  const getFanMode = (fan) => {
    if (localControlState[fan.id]?.mode !== undefined) {
      return localControlState[fan.id].mode;
    }
    return fan.mode || 'auto';
  };

  const handleSpeedChange = (fanId, newSpeed) => {
    setLocalControlState((prev) => ({
      ...prev,
      [fanId]: {
        ...prev[fanId],
        speed: newSpeed,
        mode: 'manual'
      }
    }));
  };

  const handleModeToggle = (fanId, isManual) => {
    setLocalControlState((prev) => ({
      ...prev,
      [fanId]: {
        ...prev[fanId],
        mode: isManual ? 'manual' : 'auto'
      }
    }));
  };

  // Apply single fan control
  const handleApplySingleFan = async (fan) => {
    if (!host?.id || !canControl || !isOnline) return;
    const speed = getFanSpeed(fan);
    const mode = getFanMode(fan);

    setLocalControlState((prev) => ({
      ...prev,
      [fan.id]: { ...prev[fan.id], loading: true }
    }));
    setFeedbackMsg({ type: '', text: '' });

    try {
      await apiRequest(`/api/v1/hosts/${host.id}/fans/control`, {
        method: 'POST',
        body: JSON.stringify({
          fanId: fan.id,
          controlId: fan.controlId || fan.id,
          speedPercent: speed,
          mode
        })
      });

      setFeedbackMsg({
        type: 'success',
        text: mode === 'auto'
          ? t('dashboard.fanAppliedAuto')
          : t('dashboard.fanAppliedSuccess', { speed })
      });
      if (onFanControlled) onFanControlled();
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: t('dashboard.fanApplyFailed', { error: err.message || 'Lỗi kết nối' })
      });
    } finally {
      setLocalControlState((prev) => ({
        ...prev,
        [fan.id]: { ...prev[fan.id], loading: false }
      }));
    }
  };

  // Apply global preset to all fans
  const handleApplyGlobalPreset = async (mode, speedPercent = 50) => {
    if (!host?.id || !canControl || !isOnline) return;
    setGlobalLoading(true);
    setFeedbackMsg({ type: '', text: '' });

    try {
      await apiRequest(`/api/v1/hosts/${host.id}/fans/control`, {
        method: 'POST',
        body: JSON.stringify({
          fanId: 'all',
          speedPercent,
          mode
        })
      });

      // Update all local states
      const updated = {};
      fans.forEach((f) => {
        updated[f.id] = { speed: speedPercent, mode, loading: false };
      });
      setLocalControlState(updated);

      setFeedbackMsg({
        type: 'success',
        text: mode === 'auto'
          ? t('dashboard.fanAppliedAuto')
          : t('dashboard.fanAppliedSuccess', { speed: speedPercent })
      });
      if (onFanControlled) onFanControlled();
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: t('dashboard.fanApplyFailed', { error: err.message || 'Lỗi kết nối' })
      });
    } finally {
      setGlobalLoading(false);
    }
  };

  // Compute average and max RPM
  const rpmValues = fans.map((f) => Number(f.rpm)).filter((v) => Number.isFinite(v) && v > 0);
  const avgRpm = rpmValues.length > 0 ? Math.round(rpmValues.reduce((a, b) => a + b, 0) / rpmValues.length) : null;
  const maxRpm = rpmValues.length > 0 ? Math.max(...rpmValues) : null;

  // Calculate dynamic spin animation duration based on RPM
  const getSpinDuration = (rpm, percent) => {
    if (rpm && rpm > 0) {
      // 3000 RPM -> 0.3s, 1500 RPM -> 0.6s, 600 RPM -> 1.5s
      const dur = Math.max(0.25, Math.min(3, 900 / rpm));
      return `${dur.toFixed(2)}s`;
    }
    if (percent && percent > 0) {
      const dur = Math.max(0.3, Math.min(3, (100 - percent) / 30 + 0.3));
      return `${dur.toFixed(2)}s`;
    }
    return '1.2s';
  };

  const getFanColor = (rpm, percent) => {
    if (rpm > 2200 || percent >= 85) return 'error';
    if (rpm > 1600 || percent >= 65) return 'warning';
    if (rpm > 800 || percent >= 35) return 'info';
    return 'success';
  };

  const getFanIcon = (fan) => {
    if (fan.hardwareType === 'gpu' || /gpu/i.test(fan.name || '')) {
      return <Tv size={16} />;
    }
    if (/cpu/i.test(fan.name || '')) {
      return <Cpu size={16} />;
    }
    return <Wind size={16} />;
  };

  return (
    <Card
      sx={{
        borderRadius: 2.5,
        border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
        background: isLight
          ? 'linear-gradient(180deg, #FFFFFF 0%, #F9FAFB 100%)'
          : 'linear-gradient(180deg, #111827 0%, #0F172A 100%)',
        boxShadow: isLight
          ? '0 4px 20px rgba(0,0,0,0.04)'
          : '0 4px 20px rgba(0,0,0,0.25)'
      }}
    >
      <CardHeader
        avatar={
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.primary.main, 0.12),
              color: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}`
            }}
          >
            <Fan
              size={22}
              style={{
                animation: avgRpm || fans.length > 0 ? `spin ${getSpinDuration(avgRpm, 50)} linear infinite` : 'none'
              }}
            />
          </Box>
        }
        title={
          <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, fontSize: { xs: '0.95rem', sm: '1.1rem' } }}>
              {t('dashboard.fanController')}
            </Typography>
            {fans.length > 0 && (
              <Label variant="soft" color="primary" sx={{ fontWeight: 800, height: 22 }}>
                {t('dashboard.fansCount', { count: fans.length })}
              </Label>
            )}
            {maxRpm && (
              <Label variant="soft" color={getFanColor(maxRpm, 0)} sx={{ fontWeight: 800, height: 22 }}>
                ⚡ Max: {maxRpm.toLocaleString()} RPM
              </Label>
            )}
          </Stack>
        }
        subheader={
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
            {t('dashboard.fanControllerDesc')}
          </Typography>
        }
      />

      <Divider />

      <CardContent sx={{ pt: 2, pb: 2.5 }}>
        {/* Offline / Read-only notice */}
        {!isOnline && (
          <Alert severity="warning" icon={<AlertCircle size={18} />} sx={{ mb: 2, borderRadius: 2 }}>
            {t('dashboard.fanOffline')}
          </Alert>
        )}

        {!canControl && isOnline && (
          <Alert severity="info" icon={<ShieldAlert size={18} />} sx={{ mb: 2, borderRadius: 2 }}>
            {t('dashboard.fanReadOnlyTip')}
          </Alert>
        )}

        {feedbackMsg.text && (
          <Alert
            severity={feedbackMsg.type === 'success' ? 'success' : 'error'}
            onClose={() => setFeedbackMsg({ type: '', text: '' })}
            sx={{ mb: 2, borderRadius: 2 }}
          >
            {feedbackMsg.text}
          </Alert>
        )}

        {/* Global Quick Presets Bar */}
        <Box
          sx={{
            p: { xs: 1.5, sm: 2 },
            mb: 2.5,
            borderRadius: 2,
            bgcolor: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${theme.palette.divider}`
          }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            alignItems={{ xs: 'flex-start', md: 'center' }}
            justifyContent="space-between"
            spacing={1.5}
          >
            <Box>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 800,
                  color: 'primary.main',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75
                }}
              >
                <Sliders size={13} /> {t('dashboard.fanGlobalPresets')}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
                Đồng bộ cấu hình tốc độ cho toàn bộ quạt tản nhiệt của máy trạm
              </Typography>
            </Box>

            {/* Preset Buttons */}
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              {/* Preset: Auto / BIOS */}
              <Button
                size="small"
                variant="outlined"
                color="info"
                disabled={!canControl || !isOnline || globalLoading}
                onClick={() => handleApplyGlobalPreset('auto')}
                sx={{
                  py: 0.5,
                  px: 1.25,
                  borderRadius: 1.5,
                  fontWeight: 700,
                  fontSize: '0.75rem'
                }}
              >
                ⚡ {t('dashboard.fanPresetAuto')}
              </Button>

              {/* Preset: Silent 30% */}
              <Button
                size="small"
                variant="outlined"
                color="success"
                disabled={!canControl || !isOnline || globalLoading}
                onClick={() => handleApplyGlobalPreset('manual', 30)}
                sx={{
                  py: 0.5,
                  px: 1.25,
                  borderRadius: 1.5,
                  fontWeight: 700,
                  fontSize: '0.75rem'
                }}
              >
                🌙 {t('dashboard.fanPresetSilent')}
              </Button>

              {/* Preset: Standard 50% */}
              <Button
                size="small"
                variant="outlined"
                color="primary"
                disabled={!canControl || !isOnline || globalLoading}
                onClick={() => handleApplyGlobalPreset('manual', 50)}
                sx={{
                  py: 0.5,
                  px: 1.25,
                  borderRadius: 1.5,
                  fontWeight: 700,
                  fontSize: '0.75rem'
                }}
              >
                ⚖️ {t('dashboard.fanPresetStandard')}
              </Button>

              {/* Preset: Turbo 75% */}
              <Button
                size="small"
                variant="outlined"
                color="warning"
                disabled={!canControl || !isOnline || globalLoading}
                onClick={() => handleApplyGlobalPreset('manual', 75)}
                sx={{
                  py: 0.5,
                  px: 1.25,
                  borderRadius: 1.5,
                  fontWeight: 700,
                  fontSize: '0.75rem'
                }}
              >
                🚀 {t('dashboard.fanPresetTurbo')}
              </Button>

              {/* Preset: Full 100% */}
              <Button
                size="small"
                variant="outlined"
                color="error"
                disabled={!canControl || !isOnline || globalLoading}
                onClick={() => handleApplyGlobalPreset('manual', 100)}
                sx={{
                  py: 0.5,
                  px: 1.25,
                  borderRadius: 1.5,
                  fontWeight: 700,
                  fontSize: '0.75rem'
                }}
              >
                🌪️ {t('dashboard.fanPresetFull')}
              </Button>
            </Stack>
          </Stack>
        </Box>

        {/* Individual Fan Channel Cards */}
        {fans.length === 0 ? (
          <Box
            sx={{
              p: 4,
              textAlign: 'center',
              borderRadius: 2,
              bgcolor: isLight ? 'rgba(0,0,0,0.015)' : 'rgba(255,255,255,0.015)',
              border: `1px dashed ${theme.palette.divider}`
            }}
          >
            <Fan size={36} color={theme.palette.text.disabled} />
            <Typography variant="subtitle2" sx={{ mt: 1.5, fontWeight: 700, color: 'text.secondary' }}>
              {t('dashboard.fanNoSensors')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.5 }}>
              Cảm biến vòng quay quạt sẽ tự động xuất hiện khi máy trạm gửi dữ liệu qua LibreHardwareMonitor hoặc Sysfs.
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={2}>
            {fans.map((fan) => {
              const currentSpeed = getFanSpeed(fan);
              const currentMode = getFanMode(fan);
              const isItemLoading = Boolean(localControlState[fan.id]?.loading);
              const colorKey = getFanColor(fan.rpm, currentSpeed);

              return (
                <Grid item xs={12} md={6} lg={fans.length > 2 ? 4 : 6} key={fan.id}>
                  <Box
                    sx={{
                      p: 2,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      borderRadius: 2,
                      bgcolor: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.025)',
                      border: `1px solid ${theme.palette.divider}`,
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': {
                        borderColor: alpha(theme.palette.primary.main, 0.4),
                        boxShadow: `0 4px 14px ${alpha(theme.palette.primary.main, 0.08)}`
                      }
                    }}
                  >
                    {/* Top Row: Channel Icon, Name & RPM */}
                    <Box sx={{ mb: 1.5 }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                          <Box
                            sx={{
                              width: 32,
                              height: 32,
                              borderRadius: 1.5,
                              bgcolor: alpha(theme.palette[colorKey].main, 0.12),
                              color: `${colorKey}.main`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            <Fan
                              size={17}
                              style={{
                                animation: fan.rpm || currentSpeed > 0 ? `spin ${getSpinDuration(fan.rpm, currentSpeed)} linear infinite` : 'none'
                              }}
                            />
                          </Box>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="subtitle2" noWrap sx={{ fontWeight: 800, fontSize: '0.85rem' }}>
                              {fan.name}
                            </Typography>
                            <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.68rem' }}>
                              {fan.hardwareName} • {fan.source}
                            </Typography>
                          </Box>
                        </Stack>

                        <Label
                          variant="soft"
                          color={currentMode === 'auto' ? 'info' : colorKey}
                          sx={{ fontWeight: 800, height: 22, fontSize: '0.72rem' }}
                        >
                          {currentMode === 'auto' ? 'Tự động' : `${currentSpeed}%`}
                        </Label>
                      </Stack>

                      {/* RPM Metric Readout */}
                      <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ mt: 1 }}>
                        <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.02em', fontSize: '1.4rem' }}>
                          {fan.rpm ? Number(fan.rpm).toLocaleString() : '--'}
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase' }}>
                          RPM
                        </Typography>
                        {fan.percent !== null && (
                          <Typography variant="caption" sx={{ color: 'text.secondary', ml: 'auto', fontWeight: 600 }}>
                            Mức tải: <strong>{fan.percent}%</strong>
                          </Typography>
                        )}
                      </Stack>
                    </Box>

                    {/* Bottom Row: Controls (Slider + Mode + Apply) */}
                    <Box sx={{ pt: 1.5, borderTop: `1px dashed ${theme.palette.divider}` }}>
                      {/* Mode switch */}
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                          Chế độ:
                        </Typography>
                        <FormControlLabel
                          control={
                            <Switch
                              size="small"
                              checked={currentMode === 'manual'}
                              disabled={!canControl || !isOnline || isItemLoading}
                              onChange={(e) => handleModeToggle(fan.id, e.target.checked)}
                            />
                          }
                          label={
                            <Typography variant="caption" sx={{ fontWeight: 700 }}>
                              {currentMode === 'manual' ? t('dashboard.fanModeManual') : t('dashboard.fanModeAuto')}
                            </Typography>
                          }
                          sx={{ m: 0 }}
                        />
                      </Stack>

                      {/* Manual Speed Slider */}
                      {currentMode === 'manual' && (
                        <Box sx={{ px: 0.5, mb: 1.5 }}>
                          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                              Tốc độ mong muốn:
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: `${colorKey}.main` }}>
                              {currentSpeed}%
                            </Typography>
                          </Stack>
                          <Slider
                            value={currentSpeed}
                            min={0}
                            max={100}
                            step={5}
                            disabled={!canControl || !isOnline || isItemLoading}
                            onChange={(_, val) => handleSpeedChange(fan.id, val)}
                            color={colorKey}
                            size="small"
                            sx={{
                              py: 0.5,
                              '& .MuiSlider-thumb': { width: 14, height: 14 }
                            }}
                          />

                          {/* Quick speed buttons */}
                          <Stack direction="row" spacing={0.5} justifyContent="space-between" sx={{ mt: 0.5 }}>
                            {[30, 50, 75, 100].map((preset) => (
                              <Button
                                key={preset}
                                size="small"
                                variant={currentSpeed === preset ? 'contained' : 'outlined'}
                                color={currentSpeed === preset ? 'primary' : 'inherit'}
                                disabled={!canControl || !isOnline || isItemLoading}
                                onClick={() => handleSpeedChange(fan.id, preset)}
                                sx={{
                                  py: 0.2,
                                  px: 0.75,
                                  minWidth: 'auto',
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  borderRadius: 1
                                }}
                              >
                                {preset}%
                              </Button>
                            ))}
                          </Stack>
                        </Box>
                      )}

                      {/* Apply button */}
                      <Button
                        fullWidth
                        size="small"
                        variant="contained"
                        color={currentMode === 'auto' ? 'info' : 'primary'}
                        disabled={!canControl || !isOnline || isItemLoading}
                        onClick={() => handleApplySingleFan(fan)}
                        startIcon={isItemLoading ? <CircularProgress size={14} color="inherit" /> : <CheckCircle2 size={14} />}
                        sx={{
                          mt: 1,
                          py: 0.6,
                          fontWeight: 800,
                          fontSize: '0.75rem',
                          borderRadius: 1.5
                        }}
                      >
                        {isItemLoading ? t('dashboard.fanApplying') : t('dashboard.fanApply')}
                      </Button>
                    </Box>
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        )}
      </CardContent>
    </Card>
  );
}
