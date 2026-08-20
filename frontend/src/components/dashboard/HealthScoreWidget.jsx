import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Zap,
  CheckCircle,
  RotateCcw,
  Eye,
  EyeOff,
  Trash2
} from 'lucide-react';
import { apiRequest } from '../../utils/api';
import Label from '../common/Label';
import { useLanguage } from '../../context/LanguageContext';

export default function HealthScoreWidget() {
  const theme = useTheme();
  const { lang } = useLanguage();
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);

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

  const handleResolveIssue = async (e, issue) => {
    e?.stopPropagation();
    setResolvingId(issue.id);
    try {
      await apiRequest('/api/v1/health-score/resolve', 'POST', {
        issueId: issue.id,
        agentId: issue.agentId
      });
      await loadHealth(true);
    } catch (err) {
      console.error('Failed to resolve issue:', err);
    } finally {
      setResolvingId(null);
    }
  };

  const handleRestoreIssue = async (e, issueId) => {
    e?.stopPropagation();
    try {
      await apiRequest('/api/v1/health-score/restore', 'POST', { issueId });
      await loadHealth(true);
    } catch (err) {
      console.error('Failed to restore issue:', err);
    }
  };

  const handleClearAllResolved = async () => {
    try {
      await apiRequest('/api/v1/health-score/clear-resolved', 'POST');
      await loadHealth(true);
    } catch (err) {
      console.error('Failed to clear resolved issues:', err);
    }
  };

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

  const activeIssues = health.issues || [];
  const resolvedIssues = health.resolvedIssues || [];
  const totalActiveIssues = activeIssues.length;

  return (
    <Card
      sx={{
        p: { xs: 1.25, sm: 2.5 },
        mb: { xs: 1.5, sm: 2.5 },
        background: `linear-gradient(135deg, ${scoreBg} 0%, ${theme.palette.background.paper} 100%)`,
        border: `1px solid ${alpha(scoreColor, 0.2)}`,
        borderRadius: 2.5,
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1.5, md: 3 }} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
        {/* Left: Score Gauge & Grade */}
        <Stack direction="row" spacing={{ xs: 1.5, sm: 2.5 }} alignItems="center">
          <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CircularProgress
              variant="determinate"
              value={100}
              size={56}
              thickness={4.5}
              sx={{ color: theme.palette.action.hover }}
            />
            <CircularProgress
              variant="determinate"
              value={score}
              size={56}
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
              <Typography variant="subtitle1" sx={{ fontWeight: 900, color: scoreColor, lineHeight: 1, fontSize: '1.1rem' }}>
                {score}
              </Typography>
              <Typography variant="caption" sx={{ fontSize: '0.55rem', fontWeight: 800, color: 'text.secondary' }}>
                {health.grade || 'A+'}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              <Typography variant="overline" sx={{ color: scoreColor, fontWeight: 800, letterSpacing: 0.8, fontSize: '0.625rem' }}>
                HEALTH SCORE
              </Typography>
              <Label
                variant="soft"
                color={health.status === 'excellent' ? 'success' : health.status === 'good' ? 'info' : health.status === 'warning' ? 'warning' : 'error'}
                sx={{ height: 18, fontSize: '0.65rem', px: 0.5 }}
              >
                {health.status === 'excellent' 
                  ? (lang === 'vi' ? 'Hoàn Hảo' : 'Excellent') 
                  : health.status === 'good' 
                  ? (lang === 'vi' ? 'Tốt' : 'Good') 
                  : health.status === 'warning' 
                  ? (lang === 'vi' ? 'Cần Lưu Ý' : 'Warning') 
                  : (lang === 'vi' ? 'Nghiêm Trọng' : 'Critical')}
              </Label>
              {resolvedIssues.length > 0 && (
                <Chip
                  icon={<CheckCircle2 size={10} />}
                  label={lang === 'vi' ? `Đã xử lý ${resolvedIssues.length}` : `Resolved ${resolvedIssues.length}`}
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700 }}
                />
              )}
            </Stack>

            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 0.2, fontSize: { xs: '0.8125rem', sm: '0.9375rem' } }} noWrap>
              {totalActiveIssues === 0
                ? (resolvedIssues.length > 0 
                  ? (lang === 'vi' ? 'Tất cả vấn đề đã xử lý xong • Hoạt động tối ưu' : 'All issues resolved • Systems optimal') 
                  : (lang === 'vi' ? 'Máy trạm, mạng & Gateway hoạt động ổn định' : 'Fleet, network & Gateway running smoothly'))
                : (lang === 'vi' ? `Phát hiện ${totalActiveIssues} vấn đề cần lưu ý` : `Detected ${totalActiveIssues} issues requiring attention`)}
            </Typography>

            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem', display: 'block' }} noWrap>
              {health.metrics?.onlineAgents || 0}/{health.metrics?.totalAgents || 0} {lang === 'vi' ? 'máy online' : 'agents online'} • {health.metrics?.networkTargetsCount || 0} ping • GW: {health.metrics?.gatewayOnline ? 'Online' : 'Offline'}
            </Typography>
          </Box>
        </Stack>


        {/* Middle: Category Scores Bars */}
        <Box sx={{ width: { xs: '100%', md: 260 }, my: { xs: 1, md: 0 } }}>
          <Stack spacing={1}>
            <Box>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.3 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Server size={12} /> {lang === 'vi' ? 'Máy trạm (Fleet)' : 'Fleet Agents'}
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
                  <Network size={12} /> {lang === 'vi' ? 'Mạng nội bộ (LAN/Ping)' : 'LAN & Ping Targets'}
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
                  <Shield size={12} /> Gateway & PPPoE
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
            onClick={() => setExpanded((v) => !v)}
            endIcon={expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            sx={{ fontWeight: 700, borderRadius: 2 }}
          >
            {expanded 
              ? (lang === 'vi' ? 'Thu gọn' : 'Collapse') 
              : totalActiveIssues > 0 
              ? (lang === 'vi' ? `Xem ${totalActiveIssues} vấn đề` : `View ${totalActiveIssues} issues`) 
              : (lang === 'vi' ? 'Chi tiết' : 'Details')}
          </Button>
          <Tooltip title={lang === 'vi' ? "Làm mới điểm số" : "Refresh Score"}>
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
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AlertTriangle size={16} color={theme.palette.warning.main} /> {lang === 'vi' ? `Vấn đề cần xử lý (${totalActiveIssues})` : `Action Items (${totalActiveIssues})`}
                </Typography>
                {resolvedIssues.length > 0 && (
                  <Button
                    size="small"
                    variant="text"
                    color="success"
                    onClick={() => setShowResolved((v) => !v)}
                    startIcon={showResolved ? <EyeOff size={14} /> : <CheckCircle2 size={14} />}
                    sx={{ fontSize: '0.725rem', fontWeight: 700, py: 0 }}
                  >
                    {showResolved 
                      ? (lang === 'vi' ? 'Ẩn mục đã xử lý' : 'Hide resolved') 
                      : (lang === 'vi' ? `Xem đã xử lý (${resolvedIssues.length})` : `View resolved (${resolvedIssues.length})`)}
                  </Button>
                )}
              </Stack>

              {totalActiveIssues === 0 ? (
                <Alert severity="success" sx={{ py: 0.5, borderRadius: 1.5, fontSize: '0.8rem', mb: 1 }}>
                  {resolvedIssues.length > 0
                    ? (lang === 'vi' ? `Không còn vấn đề tồn đọng (Đã xử lý xong ${resolvedIssues.length} vấn đề).` : `All issues resolved (${resolvedIssues.length} marked resolved).`)
                    : (lang === 'vi' ? 'Không có cảnh báo hay sự cố nào đang diễn ra trên hệ thống.' : 'No active alerts or incidents on the system.')}
                </Alert>
              ) : (
                <Stack spacing={1}>
                  {activeIssues.map((iss) => (
                    <Box
                      key={iss.id}
                      sx={{
                        p: 1.25,
                        borderRadius: 1.5,
                        bgcolor: alpha(iss.type === 'error' ? theme.palette.error.main : theme.palette.warning.main, 0.08),
                        borderLeft: `3px solid ${iss.type === 'error' ? theme.palette.error.main : theme.palette.warning.main}`,
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 1
                      }}
                    >
                      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                          {iss.title}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                          {iss.message}
                        </Typography>
                      </Box>
                      <Tooltip title={lang === 'vi' ? "Đánh dấu đã xử lý và xóa cảnh báo" : "Mark resolved and clear alert"}>
                        <Button
                          size="small"
                          variant="outlined"
                          color="success"
                          disabled={resolvingId === iss.id}
                          onClick={(e) => handleResolveIssue(e, iss)}
                          startIcon={<CheckCircle2 size={13} />}
                          sx={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            py: 0.35,
                            px: 1,
                            minWidth: 'auto',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            bgcolor: alpha(theme.palette.success.main, 0.08),
                            borderColor: alpha(theme.palette.success.main, 0.5),
                            '&:hover': {
                              bgcolor: alpha(theme.palette.success.main, 0.18),
                              borderColor: theme.palette.success.main
                            }
                          }}
                        >
                          {resolvingId === iss.id ? (lang === 'vi' ? 'Đang lưu...' : 'Saving...') : (lang === 'vi' ? 'Đã xử lý' : 'Resolve')}
                        </Button>
                      </Tooltip>
                    </Box>
                  ))}
                </Stack>
              )}

              {/* Show Resolved Issues Collapsible */}
              <Collapse in={showResolved && resolvedIssues.length > 0}>
                <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.success.main, 0.04), border: `1px dashed ${alpha(theme.palette.success.main, 0.3)}` }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'success.main', textTransform: 'uppercase' }}>
                      {lang === 'vi' ? `CÁC VẤN ĐỀ ĐÃ XỬ LÝ (${resolvedIssues.length})` : `RESOLVED ISSUES (${resolvedIssues.length})`}
                    </Typography>
                    <Button
                      size="small"
                      variant="text"
                      color="inherit"
                      onClick={handleClearAllResolved}
                      startIcon={<RotateCcw size={12} />}
                      sx={{ fontSize: '0.7rem', fontWeight: 700, py: 0 }}
                    >
                      {lang === 'vi' ? 'Khôi phục tất cả' : 'Restore All'}
                    </Button>
                  </Stack>
                  <Stack spacing={0.75}>
                    {resolvedIssues.map((iss) => (
                      <Box
                        key={iss.id}
                        sx={{
                          p: 1,
                          borderRadius: 1,
                          bgcolor: alpha(theme.palette.background.paper, 0.9),
                          border: `1px solid ${theme.palette.divider}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="caption" noWrap sx={{ fontWeight: 700, display: 'block', color: 'text.primary' }}>
                            {iss.title}
                          </Typography>
                          <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                            {iss.message}
                          </Typography>
                        </Box>
                        <Button
                          size="small"
                          variant="text"
                          color="primary"
                          onClick={(e) => handleRestoreIssue(e, iss.id)}
                          sx={{ fontSize: '0.7rem', fontWeight: 700, minWidth: 'auto', p: 0.5 }}
                        >
                          {lang === 'vi' ? 'Khôi phục' : 'Restore'}
                        </Button>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              </Collapse>
            </Grid>


            {/* Smart Recommendations */}
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Zap size={16} color={theme.palette.primary.main} /> {lang === 'vi' ? 'Khuyến nghị vận hành (Smart Ops)' : 'Smart Ops Recommendations'}
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
                        {lang === 'vi' ? 'Chuyển' : 'Go'}
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

