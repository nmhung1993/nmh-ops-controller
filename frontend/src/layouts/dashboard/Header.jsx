import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  IconButton,
  Stack,
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  Menu,
  Avatar,
  Divider,
  Tooltip,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Menu as MenuIcon,
  Sun,
  Moon,
  RotateCw,
  Globe,
  LogOut,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Clock
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useThemeMode } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useWebSocket } from '../../context/WebSocketContext';
import Label from '../../components/common/Label';

export const HEADER_MOBILE = 64;
export const HEADER_DESKTOP = 72;
export const NAV_WIDTH = 280;

export default function Header({ onOpenNav, currentPage, onOpenPasswordDialog }) {
  const theme = useTheme();
  const { lang, setLang, t } = useLanguage();
  const { themeMode, toggleTheme } = useThemeMode();
  const { user, logout } = useAuth();
  const { status, hosts, selectedHostId, setSelectedHostId, refreshHosts } = useWebSocket();

  const [anchorElUser, setAnchorElUser] = useState(null);
  const [anchorElLang, setAnchorElLang] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshHosts();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const getSocketLabel = () => {
    switch (status) {
      case 'connected':
        return { color: 'success', label: t('socket.live'), icon: <CheckCircle2 size={12} /> };
      case 'reconnecting':
        return { color: 'warning', label: t('socket.reconnecting'), icon: <Clock size={12} /> };
      default:
        return { color: 'error', label: t('socket.connecting'), icon: <AlertCircle size={12} /> };
    }
  };

  const socketInfo = getSocketLabel();

  return (
    <AppBar
      sx={{
        boxShadow: 'none',
        height: { xs: HEADER_MOBILE, lg: HEADER_DESKTOP },
        zIndex: theme.zIndex.appBar + 1,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        backgroundColor: alpha(theme.palette.background.default, 0.8),
        transition: theme.transitions.create(['height', 'background-color'], {
          duration: theme.transitions.duration.shorter
        }),
        width: { lg: `calc(100% - ${NAV_WIDTH}px)` },
        borderBottom: `1px solid ${theme.palette.divider}`
      }}
    >
      <Toolbar
        disableGutters
        sx={{
          height: 1,
          px: { xs: 2, md: 3 },
          display: 'flex',
          justifyContent: 'space-between'
        }}
      >
        {/* Left Side: Mobile Menu Button & Page Title */}
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <IconButton
            onClick={onOpenNav}
            sx={{
              display: { lg: 'none' },
              color: 'text.primary'
            }}
          >
            <MenuIcon size={20} />
          </IconButton>

          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.65rem' }}>
              {t(`page.${currentPage}.kicker`)}
            </Typography>
            <Typography variant="h5" sx={{ color: 'text.primary', fontWeight: 800, lineHeight: 1.15 }}>
              {t(`page.${currentPage}.title`)}
            </Typography>
          </Box>
        </Stack>

        {/* Right Side: Host Selector & Actions */}
        <Stack direction="row" alignItems="center" spacing={{ xs: 1, sm: 1.5 }}>
          {/* Socket Live Status */}
          <Label
            variant="soft"
            color={socketInfo.color}
            startIcon={socketInfo.icon}
            sx={{ display: { xs: 'none', sm: 'inline-flex' }, py: 0.5, px: 1 }}
          >
            {socketInfo.label}
          </Label>

          {/* Host Selector (shown on pages where host matters) */}
          {hosts.length > 0 && (
            <FormControl size="small" sx={{ minWidth: { xs: 120, sm: 200 } }}>
              <Select
                value={selectedHostId || ''}
                onChange={(e) => setSelectedHostId(e.target.value)}
                displayEmpty
                sx={{
                  height: 38,
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  bgcolor: 'background.paper',
                  boxShadow: theme.customShadows.z1
                }}
              >
                {hosts.map((h) => (
                  <MenuItem key={h.id} value={h.id} sx={{ fontSize: '0.8125rem', py: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ width: 1 }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: h.online ? 'success.main' : 'text.disabled'
                        }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 600, flexGrow: 1 }} noWrap>
                        {h.displayName || h.hostname}
                      </Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Refresh Button */}
          <Tooltip title={t('common.refresh')}>
            <IconButton
              onClick={handleRefresh}
              sx={{
                width: 38,
                height: 38,
                color: 'text.secondary',
                bgcolor: alpha(theme.palette.grey[500], 0.08),
                '&:hover': { bgcolor: alpha(theme.palette.grey[500], 0.16) }
              }}
            >
              <RotateCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
            </IconButton>
          </Tooltip>

          {/* Language Switcher */}
          <Tooltip title={t('language.label')}>
            <IconButton
              onClick={(e) => setAnchorElLang(e.currentTarget)}
              sx={{
                width: 38,
                height: 38,
                color: 'text.secondary',
                bgcolor: alpha(theme.palette.grey[500], 0.08),
                '&:hover': { bgcolor: alpha(theme.palette.grey[500], 0.16) }
              }}
            >
              <Globe size={18} />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={anchorElLang}
            open={Boolean(anchorElLang)}
            onClose={() => setAnchorElLang(null)}
            PaperProps={{
              sx: { width: 160, p: 0.5, mt: 1, borderRadius: 2, boxShadow: theme.customShadows.dropdown }
            }}
          >
            <MenuItem
              selected={lang === 'vi'}
              onClick={() => {
                setLang('vi');
                setAnchorElLang(null);
              }}
              sx={{ borderRadius: 1, typography: 'body2', fontWeight: lang === 'vi' ? 700 : 500 }}
            >
              🇻🇳 Tiếng Việt
            </MenuItem>
            <MenuItem
              selected={lang === 'en'}
              onClick={() => {
                setLang('en');
                setAnchorElLang(null);
              }}
              sx={{ borderRadius: 1, typography: 'body2', fontWeight: lang === 'en' ? 700 : 500 }}
            >
              🇺🇸 English
            </MenuItem>
          </Menu>

          {/* Theme Toggle */}
          <Tooltip title={themeMode === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark')}>
            <IconButton
              onClick={toggleTheme}
              sx={{
                width: 38,
                height: 38,
                color: 'text.secondary',
                bgcolor: alpha(theme.palette.grey[500], 0.08),
                '&:hover': { bgcolor: alpha(theme.palette.grey[500], 0.16) }
              }}
            >
              {themeMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </IconButton>
          </Tooltip>

          {/* User Profile Avatar Popover */}
          <IconButton
            onClick={(e) => setAnchorElUser(e.currentTarget)}
            sx={{
              p: 0,
              border: `2px solid ${alpha(theme.palette.primary.main, 0.48)}`,
              transition: 'transform 0.2s',
              '&:hover': { transform: 'scale(1.05)' }
            }}
          >
            <Avatar
              sx={{
                width: 36,
                height: 36,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                fontWeight: 700,
                fontSize: '0.9rem'
              }}
            >
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </Avatar>
          </IconButton>

          <Menu
            anchorEl={anchorElUser}
            open={Boolean(anchorElUser)}
            onClose={() => setAnchorElUser(null)}
            PaperProps={{
              sx: { width: 220, p: 0.75, mt: 1.25, borderRadius: 2, boxShadow: theme.customShadows.dropdown }
            }}
          >
            <Box sx={{ my: 1, px: 2 }}>
              <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
                {user?.username}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }} noWrap>
                {t(user?.role === 'super_admin' ? 'role.superAdmin' : user?.role === 'admin' ? 'role.admin' : 'role.viewer')}
              </Typography>
            </Box>
            <Divider sx={{ borderStyle: 'dashed', my: 1 }} />
            <MenuItem
              onClick={() => {
                setAnchorElUser(null);
                onOpenPasswordDialog();
              }}
              sx={{ borderRadius: 1, typography: 'body2', gap: 1.5 }}
            >
              <KeyRound size={16} />
              {t('password.title')}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setAnchorElUser(null);
                logout();
              }}
              sx={{ borderRadius: 1, typography: 'body2', color: 'error.main', gap: 1.5 }}
            >
              <LogOut size={16} />
              {t('session.signOut')}
            </MenuItem>
          </Menu>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
