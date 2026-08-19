import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  Grid,
  Stack,
  Typography,
  LinearProgress,
  CircularProgress,
  Chip,
  Button,
  IconButton,
  Tooltip,
  Collapse,
  Alert,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Server,
  Network,
  Shield,
  ArrowRight,
  Zap
} from 'lucide-react';
import { apiRequest } from '../../utils/api';
import Label from '../common/Label';

export default function HealthScoreWidget() {
  const theme = useTheme();
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loadHealth = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiRequest('/api/v1/health-score');
      setHealth(data);
    } catch (err) {
      console.error('Failed to load health score:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
    const interval = setInterval(() => loadHealth(true), 15000);
    return () => clearInterval(interval);
  }, [loadHealth]);

  if (!health && loading) {
    return (
      <Card sx={{ p: 2.5, mb: 3 }}>
        <LinearProgress sx={{ borderRadius: 2 }} />
      </Card>
    );
  }

  if (!health) return null;

  const score = health.score ?? 100;
  const isHealthy = score >= 80;
  const isWarning = score >= 50 && score < 80;

  const scoreColor = isHealthy
    ? theme.palette.success.main
    : isWarning
    ? theme.palette.warning.main
    : theme.palette.error.main;

  const scoreBg = isHealthy
    ? alpha(theme.palette.success.main, 0.08)
    : isWarning
    ? alpha(theme.palette.warning.main, 0.08)
    : alpha(theme.palette.error.main, 0.08);

  const totalIssues = (health.issues || []).length;

  return (
    <Card
      sx={{
        p: 2.5,
        mb: 3,
        background: `linear-gradient(135deg, ${scoreBg} 0%, ${theme.palette.background.paper} 100%)`,
        border: `1px solid ${alpha(scoreColor, 0.2)}`,
        borderRadius: 2.5,
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="center" justifyContent="space-between">
        {/* Left: Score Gauge & Grade */}
        <Stack direction="row" spacing={2.5} alignItems="center">
          <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress
              variant="determinate"
              value={100}
              size={76}
              thickness={4.5}
              sx={{ color: theme.palette.action.hover }}
            />
            <CircularProgress
              variant="determinate"
              value={score}
              size={76}
              thickness={4.5}
              sx={{
                color: scoreColor,
                position: 'absolute',
                left: 0,
                strokeLinecap: 'round'
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Typography variant="h5" sx={{ fontWeight: 900, color: scoreColor, lineHeight: 1 }}>
                {score}
              </Typography>
              <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 800, color: 'text.secondary' }}>
                {health.grade || 'A+'}
              </Typography>
            </Box>
          </Box>

          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="overline" sx={{ color: scoreColor, fontWeight: 800, letterSpacing: 1.2 }}>
                ĐIỂM SỨC KHỎE HẠ TẦNG (HEALTH SCORE)
              </Typography>
              <Label
                variant="soft"
                color={health.status === 'excellent' ? 'success' : health.status === 'good' ? 'info' : health.status === 'warning' ? 'warning' : 'error'}
              >
                {health.status === 'excellent' ? 'Hoàn Hảo' : health.status === 'good' ? 'Tốt' : health.status === 'warning' ? 'Cần Lưu Ý' : 'Nghiêm Trọng'}
              </Label>
            </Stack>

            <Typography variant="h6" sx={{ fontWeight: 800, mt: 0.2 }}>
              {totalIssues === 0 ? 'Toàn bộ máy trạm, kết nối mạng & Gateway hoạt động ổn định' : `Phát hiện ${totalIssues} vấn đề cần lưu ý trong hạ tầng`}
            </Typography>

            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
              {health.metrics?.onlineAgents || 0}/{health.metrics?.totalAgents || 0} máy trạm online • {health.metrics?.networkTargetsCount || 0} mục tiêu ping • Gateway: {health.metrics?.gatewayOnline ? 'Online' : 'Offline'}
            </Typography>
          </Box>
        </Stack>

        {/* Middle: Category Scores Bars */}
        <Box sx={{ width: { xs: '100%', md: 260 }, my: { xs: 1, md: 0 } }}>
          <Stack spacing={1}>
            <Box>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.3 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Server size={12} /> Máy trạm (Fleet)
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 800 }}>
                  {health.categoryScores?.fleet ?? 100}%
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={health.categoryScores?.fleet ?? 100}
                color={health.categoryScores?.fleet > 80 ? 'success' : health.categoryScores?.fleet > 50 ? 'warning' : 'error'}
                sx={{ height: 5, borderRadius: 2.5 }}
              />
            </Box>

            <Box>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.3 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Network size={12} /> Mạng nội bộ (LAN/Ping)
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 800 }}>
                  {health.categoryScores?.network ?? 100}%
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={health.categoryScores?.network ?? 100}
                color={health.categoryScores?.network > 80 ? 'success' : health.categoryScores?.network > 50 ? 'warning' : 'error'}
                sx={{ height: 5, borderRadius: 2.5 }}
              />
            </Box>

            <Box>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.3 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Shield size={12} /> RouterOS & PPPoE
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 800 }}>
                  {health.categoryScores?.gateway ?? 100}%
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={health.categoryScores?.gateway ?? 100}
                color={health.categoryScores?.gateway > 80 ? 'success' : health.categoryScores?.gateway > 50 ? 'warning' : 'error'}
                sx={{ height: 5, borderRadius: 2.5 }}
              />
            </Box>
          </Stack>
        </Box>

        {/* Right: Actions */}
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            size="small"
            variant="outlined"
            onClick={() => setExpanded(v => !v)}
            endIcon={expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            sx={{ fontWeight: 700, borderRadius: 2 }}
          >
            {expanded ? 'Thu gọn' : totalIssues > 0 ? `Xem ${totalIssues} vấn đề` : 'Chi tiết'}
          </Button>
          <Tooltip title="Làm mới điểm số">
            <IconButton size="small" onClick={() => loadHealth(false)} disabled={loading}>
              <RefreshCw size={16} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Expandable Breakdown of Issues & Recommendations */}
      <Collapse in={expanded}>
        <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px dashed ${alpha(theme.palette.divider, 0.6)}` }}>
          <Grid container spacing={2}>
            {/* Active Issues */}
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <AlertTriangle size={16} color={theme.palette.warning.main} /> Vấn đề phát hiện ({totalIssues})
              </Typography>
              {totalIssues === 0 ? (
                <Alert severity="success" sx={{ py: 0.5, borderRadius: 1.5, fontSize: '0.8rem' }}>
                  Không có cảnh báo hay sự cố nào đang diễn ra trên hệ thống.
                </Alert>
              ) : (
                <Stack spacing={1}>
                  {health.issues.map((iss) => (
                    <Box
                      key={iss.id}
                      sx={{
                        p: 1.2,
                        borderRadius: 1.5,
                        bgcolor: alpha(iss.type === 'error' ? theme.palette.error.main : theme.palette.warning.main, 0.08),
                        borderLeft: `3px solid ${iss.type === 'error' ? theme.palette.error.main : theme.palette.warning.main}`
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                        {iss.title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        {iss.message}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </Grid>

            {/* Smart Recommendations */}
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Zap size={16} color={theme.palette.primary.main} /> Khuyến nghị vận hành (Smart Ops)
              </Typography>
              <Stack spacing={1}>
                {(health.recommendations || []).map((rec, rIdx) => (
                  <Box
                    key={rIdx}
                    sx={{
                      p: 1.2,
                      borderRadius: 1.5,
                      bgcolor: alpha(theme.palette.primary.main, 0.05),
                      border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                      {rec.title}
                    </Typography>
                    {rec.href && (
                      <Button
                        size="small"
                        href={rec.href}
                        endIcon={<ArrowRight size={13} />}
                        sx={{ fontSize: '0.75rem', fontWeight: 700, minWidth: 0, px: 1 }}
                      >
                        Chuyển
                      </Button>
                    )}
                  </Box>
                ))}
              </Stack>
            </Grid>
          </Grid>
        </Box>
      </Collapse>
    </Card>
  );
}
