import React from 'react';
import {
  Box,
  Drawer,
  Stack,
  Typography,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  List,
  Chip,
  IconButton,
  Tooltip,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  LayoutDashboard,
  Server,
  Activity,
  ShieldCheck,
  History,
  Settings,
  Radio,
  Globe,
  Boxes,
  Terminal,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useWebSocket } from '../../context/WebSocketContext';
import { useSystemSettings } from '../../context/SystemSettingsContext';
import PwaInstallButton from '../../components/common/PwaInstallButton';

export const NAV_ITEMS = [

  { id: 'network', path: '#network', labelKey: 'nav.network', icon: Globe },
  { id: 'docker', path: '#docker', labelKey: 'nav.docker', icon: Boxes },
  { id: 'fleet', path: '#fleet', labelKey: 'nav.fleet', icon: Server },
  { id: 'dashboard', path: '#dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { id: 'processes', path: '#processes', labelKey: 'nav.processes', icon: Activity },
  { id: 'watchdog', path: '#watchdog', labelKey: 'nav.watchdog', icon: ShieldCheck },
  { id: 'scripts', path: '#scripts', labelKey: 'nav.scripts', icon: Terminal },
  { id: 'activity', path: '#activity', labelKey: 'nav.activity', icon: History },
  { id: 'admin', path: '#admin', labelKey: 'nav.admin', icon: Settings, superAdminOnly: true }
];

export const NAV_WIDTH = 270;
export const NAV_COLLAPSED_WIDTH = 84;

export default function NavSidebar({ openNav, onCloseNav, currentPage, onNavigate, isCollapsed, onToggleCollapse }) {
  const theme = useTheme();
  const isLight = theme.palette.mode === 'light';
  const { t } = useLanguage();
  const { isSuperAdmin, user } = useAuth();
  const { hosts } = useWebSocket();
  const { settings } = useSystemSettings();

  const onlineCount = hosts.filter((h) => h.online).length;
  const offlineCount = hosts.filter((h) => !h.online).length;
  const currentNavWidth = isCollapsed ? NAV_COLLAPSED_WIDTH : NAV_WIDTH;

  const renderContent = (
    <Box
      sx={{
        height: 1,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: isLight ? '#FFFFFF' : '#0B0F17',
        borderRight: `1px solid ${theme.palette.divider}`,
        px: isCollapsed ? 1.25 : 2,
        py: 2,
        transition: theme.transitions.create(['width', 'padding'], {
          duration: theme.transitions.duration.shorter
        })
      }}
    >
      {/* Brand Logo & Collapse Button */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent={isCollapsed ? 'center' : 'space-between'}
        sx={{ mb: isCollapsed ? 2.5 : 3, px: 0.5 }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{ cursor: 'pointer', minWidth: 0 }}
          onClick={() => onNavigate('network')}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '11px',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
              fontWeight: 800,
              fontSize: '1rem',
              letterSpacing: -0.5,
              flexShrink: 0,
              overflow: 'hidden'
            }}
          >
            {settings.logoUrl ? (
              <Box component="img" src={settings.logoUrl} alt="Logo" sx={{ width: 1, height: 1, objectFit: 'cover' }} />
            ) : (
              settings.logoText || 'NMH'
            )}
          </Box>
          {!isCollapsed && (
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" noWrap sx={{ fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
                {settings.appName || 'NMH Ops'}
              </Typography>
              <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem', display: 'block' }}>
                {settings.appSubtitle || 'Fleet Controller'}
              </Typography>
            </Box>
          )}
        </Stack>

        {/* Desktop Collapse / Expand Toggle Button */}
        {!isCollapsed && (
          <Tooltip title="Thu gọn menu" placement="right">
            <IconButton
              size="small"
              onClick={onToggleCollapse}
              sx={{
                display: { xs: 'none', lg: 'inline-flex' },
                color: 'text.secondary',
                bgcolor: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
                borderRadius: 2,
                '&:hover': { bgcolor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)' }
              }}
            >
              <PanelLeftClose size={16} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      {/* When collapsed on desktop, show expand button */}
      {isCollapsed && (
        <Box sx={{ display: { xs: 'none', lg: 'flex' }, justifyContent: 'center', mb: 2 }}>
          <Tooltip title="Mở rộng menu" placement="right">
            <IconButton
              size="small"
              onClick={onToggleCollapse}
              sx={{
                color: 'text.secondary',
                bgcolor: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
                borderRadius: 2,
                '&:hover': { bgcolor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)' }
              }}
            >
              <PanelLeftOpen size={16} />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* Environment Badge (expanded only) */}
      {!isCollapsed && (
        <Box
          sx={{
            p: 1.25,
            px: 1.5,
            mb: 2,
            borderRadius: 2.5,
            bgcolor: isLight ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.12)',
            border: `1px solid ${isLight ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.25)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: 1.25
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: 'success.main',
              boxShadow: `0 0 0 3px ${alpha(theme.palette.success.main, 0.25)}`
            }}
          />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="caption" noWrap sx={{ color: 'text.secondary', display: 'block', fontWeight: 700, letterSpacing: '0.04em', fontSize: '0.65rem', textTransform: 'uppercase' }}>
              {t('sidebar.environment')}
            </Typography>
            <Typography variant="subtitle2" noWrap sx={{ color: 'primary.main', fontWeight: 700, fontSize: '0.8125rem' }}>
              {t('sidebar.environmentValue')}
            </Typography>
          </Box>
          <Radio size={14} color={theme.palette.primary.main} />
        </Box>
      )}

      {/* Fleet Pulse Stats (expanded only) */}
      {!isCollapsed && (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            mb: 2,
            p: 1,
            borderRadius: 2,
            bgcolor: isLight ? '#F1F5F9' : '#111827',
            border: `1px solid ${theme.palette.divider}`
          }}
        >
          <Box sx={{ flex: 1, textAlign: 'center' }}>
            <Typography variant="h6" sx={{ color: 'success.main', fontWeight: 800, lineHeight: 1.2 }}>
              {onlineCount}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.6875rem' }}>
              {t('common.online')}
            </Typography>
          </Box>
          <Box sx={{ width: '1px', bgcolor: 'divider', my: 0.5 }} />
          <Box sx={{ flex: 1, textAlign: 'center' }}>
            <Typography variant="h6" sx={{ color: offlineCount > 0 ? 'warning.main' : 'text.disabled', fontWeight: 800, lineHeight: 1.2 }}>
              {offlineCount}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.6875rem' }}>
              {t('common.offline')}
            </Typography>
          </Box>
        </Stack>
      )}

      {/* Navigation Links */}
      <List component="nav" sx={{ px: 0, flexGrow: 1, overflowY: 'auto' }}>
        {NAV_ITEMS.map((item) => {
          if (item.superAdminOnly && !isSuperAdmin) return null;
          if (!isSuperAdmin && user?.permissions?.pages && user.permissions.pages[item.id] === false) return null;

          const IconComponent = item.icon;
          const active = currentPage === item.id;

          const button = (
            <ListItemButton
              key={item.id}
              onClick={() => {
                onNavigate(item.id);
                if (onCloseNav) onCloseNav();
              }}
              sx={{
                mb: 0.5,
                py: isCollapsed ? 1.25 : 1,
                px: isCollapsed ? 1 : 1.5,
                borderRadius: 2,
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                typography: 'body2',
                fontWeight: active ? 700 : 500,
                color: active ? (isLight ? 'primary.dark' : '#FFFFFF') : 'text.secondary',
                bgcolor: active
                  ? (isLight ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.16)')
                  : 'transparent',
                border: active
                  ? `1px solid ${isLight ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.35)'}`
                  : '1px solid transparent',
                transition: 'all 150ms ease',
                '&:hover': {
                  bgcolor: active
                    ? (isLight ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.22)')
                    : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'),
                  color: active ? 'primary.main' : 'text.primary',
                  transform: 'translateX(2px)'
                }
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: isCollapsed ? 0 : 30,
                  justifyContent: 'center',
                  color: active ? 'primary.main' : 'text.secondary',
                  '& svg': { width: 18, height: 18 }
                }}
              >
                <IconComponent />
              </ListItemIcon>
              {!isCollapsed && (
                <>
                  <ListItemText
                    primary={t(item.labelKey)}
                    primaryTypographyProps={{
                      fontSize: '0.84rem',
                      fontWeight: active ? 700 : 500,
                      letterSpacing: '-0.01em'
                    }}
                  />
                  {item.id === 'fleet' && (
                    <Chip
                      label={hosts.length}
                      size="small"
                      sx={{
                        height: 20,
                        minWidth: 20,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        bgcolor: active ? 'primary.main' : (isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'),
                        color: active ? 'primary.contrastText' : 'text.secondary',
                        borderRadius: 1.5
                      }}
                    />
                  )}
                </>
              )}
            </ListItemButton>
          );

          if (isCollapsed) {
            return (
              <Tooltip key={item.id} title={t(item.labelKey)} placement="right">
                {button}
              </Tooltip>
            );
          }

          return button;
        })}
      </List>

      {/* Footer Info */}
      <Box sx={{ pt: 1.5, px: isCollapsed ? 0.5 : 1.5, pb: 0.5, borderTop: `1px solid ${theme.palette.divider}`, textAlign: 'center' }}>
        {!isCollapsed ? (
          <Stack spacing={1} alignItems="center">
            <PwaInstallButton variant="button" sx={{ width: '100%', py: 0.6 }} />
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: 0.2, fontSize: '0.7rem' }}>
              <Box component="span" sx={{ color: 'primary.main', fontWeight: 700 }}>{settings.ownerSignature || '@nmhung1993'}</Box>
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={1} alignItems="center">
            <PwaInstallButton variant="icon" />
            <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 800 }}>
              {settings.logoText || 'NMH'}
            </Typography>
          </Stack>
        )}
      </Box>

    </Box>
  );

  return (
    <Box component="nav" sx={{ flexShrink: { lg: 0 }, width: { lg: currentNavWidth }, transition: theme.transitions.create('width') }}>
      {/* Mobile Drawer */}
      <Drawer
        open={openNav}
        onClose={onCloseNav}
        PaperProps={{
          sx: {
            width: NAV_WIDTH,
            bgcolor: 'background.paper'
          }
        }}
        sx={{ display: { xs: 'block', lg: 'none' } }}
      >
        {renderContent}
      </Drawer>

      {/* Desktop Persistent Sidebar */}
      <Drawer
        open
        variant="permanent"
        PaperProps={{
          sx: {
            width: currentNavWidth,
            bgcolor: 'background.paper',
            borderRight: 'none',
            transition: theme.transitions.create('width', {
              duration: theme.transitions.duration.shorter
            })
          }
        }}
        sx={{ display: { xs: 'none', lg: 'block' } }}
      >
        {renderContent}
      </Drawer>
    </Box>
  );
}

