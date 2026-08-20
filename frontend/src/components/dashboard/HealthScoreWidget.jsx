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
  EyeOff,
  RotateCcw,
  Eye
} from 'lucide-react';
import { apiRequest } from '../../utils/api';
import Label from '../common/Label';

const IGNORED_ISSUES_STORAGE_KEY = 'minhhungops_ignored_health_issues';

export default function HealthScoreWidget() {
  const theme = useTheme();
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);

  // Ignored issues state persisted in localStorage
  const [ignoredIssueIds, setIgnoredIssueIds] = useState(() => {
    try {
      const stored = localStorage.getItem(IGNORED_ISSUES_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const saveIgnored = (ids) => {
    setIgnoredIssueIds(ids);
    try {
      localStorage.setItem(IGNORED_ISSUES_STORAGE_KEY, JSON.stringify(ids));
    } catch (e) {
      console.error('Failed to save ignored issues:', e);
    }
  };

  const handleIgnoreIssue = (e, issueId) => {
    e?.stopPropagation();
    if (!ignoredIssueIds.includes(issueId)) {
      saveIgnored([...ignoredIssueIds, issueId]);
    }
  };

  const handleRestoreIssue = (e, issueId) => {
    e?.stopPropagation();
    saveIgnored(ignoredIssueIds.filter((id) => id !== issueId));
  };

  const handleClearAllIgnored = () => {
    saveIgnored([]);
  };

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

  const rawIssues = health?.issues || [];
  const activeIssues = useMemo(
    () => rawIssues.filter((iss) => !ignoredIssueIds.includes(iss.id)),
    [rawIssues, ignoredIssueIds]
  );
  const ignoredList = useMemo(
    () => rawIssues.filter((iss) => ignoredIssueIds.includes(iss.id)),
    [rawIssues, ignoredIssueIds]
  );

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

  const totalActiveIssues = activeIssues.length;

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
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              <Typography variant="overline" sx={{ color: scoreColor, fontWeight: 800, letterSpacing: 1.2 }}>
                ĐIỂM SỨC KHỎE HẠ TẦNG (HEALTH SCORE)
              </Typography>
              <Label
                variant="soft"
                color={health.status === 'excellent' ? 'success' : health.status === 'good' ? 'info' : health.status === 'warning' ? 'warning' : 'error'}
              >
                {health.status === 'excellent' ? 'Hoàn Hảo' : health.status === 'good' ? 'Tốt' : health.status === 'warning' ? 'Cần Lưu Ý' : 'Nghiêm Trọng'}
              </Label>
              {ignoredList.length > 0 && (
                <Chip
                  label={`Đã bỏ qua ${ignoredList.length}`}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.6875rem', fontWeight: 700 }}
                />
              )}
            </Stack>

            <Typography variant="h6" sx={{ fontWeight: 800, mt: 0.2 }}>
              {totalActiveIssues === 0
                ? (ignoredList.length > 0 ? 'Tất cả vấn đề đã được bỏ qua / Hệ thống ổn định' : 'Toàn bộ máy trạm, kết nối mạng & Gateway hoạt động ổn định')
                : `Phát hiện ${totalActiveIssues} vấn đề cần lưu ý trong hạ tầng`}
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
            onClick={() => setExpanded((v) => !v)}
            endIcon={expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            sx={{ fontWeight: 700, borderRadius: 2 }}
          >
            {expanded ? 'Thu gọn' : totalActiveIssues > 0 ? `Xem ${totalActiveIssues} vấn đề` : 'Chi tiết'}
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
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AlertTriangle size={16} color={theme.palette.warning.main} /> Vấn đề phát hiện ({totalActiveIssues})
                </Typography>
                {ignoredList.length > 0 && (
                  <Button
                    size="small"
                    variant="text"
                    color="inherit"
                    onClick={() => setShowIgnored((v) => !v)}
                    startIcon={showIgnored ? <Eye size={14} /> : <EyeOff size={14} />}
                    sx={{ fontSize: '0.725rem', fontWeight: 700, py: 0 }}
                  >
                    {showIgnored ? 'Ẩn mục đã bỏ qua' : `Xem đã bỏ qua (${ignoredList.length})`}
                  </Button>
                )}
              </Stack>

              {totalActiveIssues === 0 ? (
                <Alert severity="success" sx={{ py: 0.5, borderRadius: 1.5, fontSize: '0.8rem', mb: 1 }}>
                  {ignoredList.length > 0
                    ? `Không còn vấn đề chưa xử lý (Đã bỏ qua ${ignoredList.length} vấn đề).`
                    : 'Không có cảnh báo hay sự cố nào đang diễn ra trên hệ thống.'}
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
                      <Tooltip title="Bỏ qua cảnh báo này">
                        <Button
                          size="small"
                          variant="outlined"
                          color="inherit"
                          onClick={(e) => handleIgnoreIssue(e, iss.id)}
                          startIcon={<EyeOff size={12} />}
                          sx={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            py: 0.25,
                            px: 0.75,
                            minWidth: 'auto',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            borderColor: alpha(theme.palette.divider, 0.8)
                          }}
                        >
                          Bỏ qua
                        </Button>
                      </Tooltip>
                    </Box>
                  ))}
                </Stack>
              )}

              {/* Show Ignored Issues Collapsible */}
              <Collapse in={showIgnored && ignoredList.length > 0}>
                <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.grey[500], 0.06), border: `1px dashed ${theme.palette.divider}` }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase' }}>
                      CÁC VẤN ĐỀ ĐÃ BỎ QUA ({ignoredList.length})
                    </Typography>
                    <Button
                      size="small"
                      variant="text"
                      color="primary"
                      onClick={handleClearAllIgnored}
                      startIcon={<RotateCcw size={12} />}
                      sx={{ fontSize: '0.7rem', fontWeight: 700, py: 0 }}
                    >
                      Khôi phục tất cả
                    </Button>
                  </Stack>
                  <Stack spacing={0.75}>
                    {ignoredList.map((iss) => (
                      <Box
                        key={iss.id}
                        sx={{
                          p: 1,
                          borderRadius: 1,
                          bgcolor: alpha(theme.palette.background.paper, 0.8),
                          border: `1px solid ${theme.palette.divider}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="caption" noWrap sx={{ fontWeight: 700, display: 'block' }}>
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
                          Khôi phục
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

