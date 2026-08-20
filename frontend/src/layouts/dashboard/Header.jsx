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
  Button,
  Chip,
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
  Clock,
  Search,
  Palette,
  Check
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useThemeMode } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useWebSocket } from '../../context/WebSocketContext';
import Label from '../../components/common/Label';
import PwaInstallButton from '../../components/common/PwaInstallButton';

export const HEADER_MOBILE = 54;

export const HEADER_DESKTOP = 68;
export const NAV_WIDTH = 280;
export const NAV_COLLAPSED_WIDTH = 88;

export default function Header({ onOpenNav, currentPage, onOpenPasswordDialog, onOpenCommandPalette, isCollapsed }) {
  const theme = useTheme();
  const { lang, setLang, t } = useLanguage();
  const { themeMode, themeColor, setThemeMode, toggleTheme, setThemeColor, colorPresets } = useThemeMode();
  const { user, logout } = useAuth();
  const { status, hosts, selectedHostId, setSelectedHostId, refreshHosts } = useWebSocket();

  const [anchorElUser, setAnchorElUser] = useState(null);
  const [anchorElLang, setAnchorElLang] = useState(null);
  const [anchorElTheme, setAnchorElTheme] = useState(null);
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
  const currentNavWidth = isCollapsed ? NAV_COLLAPSED_WIDTH : NAV_WIDTH;

  return (
    <AppBar
      sx={{
        boxShadow: 'none',
        height: { xs: HEADER_MOBILE, lg: HEADER_DESKTOP },
        zIndex: theme.zIndex.appBar + 1,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        backgroundColor: alpha(theme.palette.background.default, 0.85),
        transition: theme.transitions.create(['height', 'background-color', 'width'], {
          duration: theme.transitions.duration.shorter
        }),
        width: { lg: `calc(100% - ${currentNavWidth}px)` },
        borderBottom: `1px solid ${theme.palette.divider}`
      }}
    >
      <Toolbar
        disableGutters
        sx={{
          height: 1,
          px: { xs: 1, sm: 2.5 },
          display: 'flex',
          justifyContent: 'space-between'
        }}
      >

        {/* Left Side: Mobile Menu Button & Page Title */}
        <Stack direction="row" alignItems="center" spacing={{ xs: 1, sm: 1.5 }} sx={{ minWidth: 0 }}>
          <IconButton
            onClick={onOpenNav}
            sx={{
              display: { lg: 'none' },
              color: 'text.primary',
              flexShrink: 0
            }}
          >
            <MenuIcon size={20} />
          </IconButton>

          <Box sx={{ minWidth: 0, display: { xs: 'none', md: 'block' } }}>
            <Typography variant="overline" noWrap sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.65rem', display: 'block' }}>
              {t(`page.${currentPage}.kicker`)}
            </Typography>
            <Typography variant="h6" noWrap sx={{ color: 'text.primary', fontWeight: 800, lineHeight: 1.15 }}>
              {t(`page.${currentPage}.title`)}
            </Typography>
          </Box>
        </Stack>

        {/* Right Side: Host Selector & Actions */}
        <Stack direction="row" alignItems="center" spacing={{ xs: 0.5, sm: 1.5 }} sx={{ minWidth: 0 }}>
          {/* Quick Command Palette Button */}
          <Tooltip title={t('header.quickSearchTooltip')}>
            <Button
              variant="outlined"
              size="small"
              onClick={onOpenCommandPalette}
              startIcon={<Search size={14} />}
              endIcon={
                <Chip
                  label="Ctrl K"
                  size="small"
                  sx={{ height: 18, fontSize: '0.65rem', fontWeight: 800, bgcolor: alpha(theme.palette.divider, 0.6) }}
                />
              }
              sx={{
                display: { xs: 'none', md: 'inline-flex' },
                borderRadius: 2,
                textTransform: 'none',
                color: 'text.secondary',
                borderColor: alpha(theme.palette.divider, 0.8),
                py: 0.5,
                px: 1.2
              }}
            >
              {t('header.quickSearch')}
            </Button>
          </Tooltip>
          <IconButton
            onClick={onOpenCommandPalette}
            sx={{
              display: { xs: 'inline-flex', md: 'none' },
              width: 38,
              height: 38,
              color: 'text.secondary',
              bgcolor: alpha(theme.palette.grey[500], 0.08)
            }}
          >
            <Search size={18} />
          </IconButton>

          {/* Socket Live Status */}
          <Label
            variant="soft"
            color={socketInfo.color}
            startIcon={socketInfo.icon}
            sx={{ display: { xs: 'none', sm: 'inline-flex' }, py: 0.5, px: 1, flexShrink: 0 }}
          >
            {socketInfo.label}
          </Label>

          {/* Host Selector */}
          {hosts.length > 0 && (
            <FormControl size="small" sx={{ width: { xs: 130, sm: 180, md: 220 }, flexShrink: 0 }}>
              <Select
                value={selectedHostId || ''}
                onChange={(e) => setSelectedHostId(e.target.value)}
                displayEmpty
                sx={{
                  borderRadius: 1.5,
                  fontSize: { xs: '0.75rem', sm: '0.85rem' },
                  bgcolor: alpha(theme.palette.grey[500], 0.08),
                  '& .MuiSelect-select': {
                    py: 0.75,
                    px: 1.25,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }
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

          {/* PWA Install Button (Android / iOS / Desktop) */}
          <PwaInstallButton />

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

          {/* Theme & Color Switcher */}
          <Tooltip title={t('header.themeSettings')}>
            <IconButton
              onClick={(e) => setAnchorElTheme(e.currentTarget)}
              sx={{
                width: 38,
                height: 38,
                color: 'text.secondary',
                bgcolor: alpha(theme.palette.grey[500], 0.08),
                '&:hover': { bgcolor: alpha(theme.palette.grey[500], 0.16) }
              }}
            >
              <Palette size={18} />
            </IconButton>
          </Tooltip>

          {/* Theme & Color Popover Menu */}
          <Menu
            anchorEl={anchorElTheme}
            open={Boolean(anchorElTheme)}
            onClose={() => setAnchorElTheme(null)}
            PaperProps={{
              sx: {
                width: 280,
                p: 2,
                mt: 1,
                borderRadius: 2.5,
                boxShadow: theme.customShadows.dropdown
              }
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Palette size={16} /> {t('header.themeMenuTitle')}
            </Typography>

            {/* Mode Switcher */}
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', mb: 1, display: 'block' }}>
              {t('header.themeMode')}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <Button
                variant={themeMode === 'light' ? 'contained' : 'outlined'}
                size="small"
                fullWidth
                startIcon={<Sun size={15} />}
                onClick={() => setThemeMode('light')}
                sx={{ borderRadius: 1.5, fontWeight: 700 }}
              >
                {t('header.modeLight')}
              </Button>
              <Button
                variant={themeMode === 'dark' ? 'contained' : 'outlined'}
                size="small"
                fullWidth
                startIcon={<Moon size={15} />}
                onClick={() => setThemeMode('dark')}
                sx={{ borderRadius: 1.5, fontWeight: 700 }}
              >
                {t('header.modeDark')}
              </Button>
            </Stack>

            <Divider sx={{ my: 1.5, borderStyle: 'dashed' }} />

            {/* Color Presets */}
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', mb: 1, display: 'block' }}>
              {t('header.accentColor')}
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 1.25,
                mb: 1
              }}
            >
              {(colorPresets || []).map((preset) => {
                const isSelected = themeColor === preset.id || themeColor.toLowerCase() === preset.main.toLowerCase();
                return (
                  <Tooltip key={preset.id} title={preset.label} arrow>
                    <Box
                      onClick={() => setThemeColor(preset.id)}
                      sx={{
                        height: 36,
                        borderRadius: 1.5,
                        bgcolor: preset.main,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FFFFFF',
                        border: isSelected ? '2.5px solid #FFFFFF' : 'none',
                        boxShadow: isSelected ? `0 0 0 2px ${preset.main}, 0 4px 10px ${alpha(preset.main, 0.4)}` : `0 2px 4px ${alpha(preset.main, 0.2)}`,
                        transition: 'transform 0.15s ease',
                        '&:hover': { transform: 'scale(1.08)' }
                      }}
                    >
                      {isSelected && <Check size={16} strokeWidth={3} />}
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>
          </Menu>

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
