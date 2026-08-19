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
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useWebSocket } from '../../context/WebSocketContext';
import { useSystemSettings } from '../../context/SystemSettingsContext';

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

export const NAV_WIDTH = 280;
export const NAV_COLLAPSED_WIDTH = 88;

export default function NavSidebar({ openNav, onCloseNav, currentPage, onNavigate, isCollapsed, onToggleCollapse }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { isSuperAdmin } = useAuth();
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
        bgcolor: 'background.paper',
        borderRight: `1px solid ${theme.palette.divider}`,
        px: isCollapsed ? 1.5 : 2.5,
        py: 2.5,
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
        sx={{ mb: isCollapsed ? 3 : 3.5, px: 0.5 }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{ cursor: 'pointer' }}
          onClick={() => onNavigate('network')}
        >
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: '12px',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: theme.customShadows.primary,
              fontWeight: 800,
              fontSize: '1.1rem',
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
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.15 }}>
                {settings.appName || 'NMH Ops Controller'}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.8125rem' }}>
                {settings.appSubtitle || 'Controller'}
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
                bgcolor: alpha(theme.palette.grey[500], 0.08),
                '&:hover': { bgcolor: alpha(theme.palette.grey[500], 0.16) }
              }}
            >
              <PanelLeftClose size={18} />
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
                bgcolor: alpha(theme.palette.grey[500], 0.08),
                '&:hover': { bgcolor: alpha(theme.palette.grey[500], 0.16) }
              }}
            >
              <PanelLeftOpen size={18} />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* Environment Badge (expanded only) */}
      {!isCollapsed && (
        <Box
          sx={{
            p: 1.75,
            mb: 2.5,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.primary.main, 0.08),
            border: `1px solid ${alpha(theme.palette.primary.main, 0.16)}`,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: 'success.main',
              boxShadow: `0 0 0 3px ${alpha(theme.palette.success.main, 0.24)}`
            }}
          />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 700, letterSpacing: 0.5 }}>
              {t('sidebar.environment')}
            </Typography>
            <Typography variant="subtitle2" sx={{ color: 'primary.darker', fontWeight: 700 }}>
              {t('sidebar.environmentValue')}
            </Typography>
          </Box>
          <Radio size={16} color={theme.palette.primary.main} />
        </Box>
      )}

      {/* Fleet Pulse Stats (expanded only) */}
      {!isCollapsed && (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            mb: 2.5,
            p: 1.25,
            borderRadius: 2,
            bgcolor: theme.palette.mode === 'light' ? theme.palette.grey[100] : alpha(theme.palette.grey[800], 0.5),
            border: `1px solid ${theme.palette.divider}`
          }}
        >
          <Box sx={{ flex: 1, textAlign: 'center' }}>
            <Typography variant="h6" sx={{ color: 'success.main', fontWeight: 800 }}>
              {onlineCount}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.7rem' }}>
              {t('common.online')}
            </Typography>
          </Box>
          <Box sx={{ width: '1px', bgcolor: 'divider', my: 0.5 }} />
          <Box sx={{ flex: 1, textAlign: 'center' }}>
            <Typography variant="h6" sx={{ color: offlineCount > 0 ? 'warning.main' : 'text.disabled', fontWeight: 800 }}>
              {offlineCount}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.7rem' }}>
              {t('common.offline')}
            </Typography>
          </Box>
        </Stack>
      )}

      {/* Navigation Links */}
      <List component="nav" sx={{ px: 0, flexGrow: 1 }}>
        {NAV_ITEMS.map((item) => {
          if (item.superAdminOnly && !isSuperAdmin) return null;

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
                mb: 0.75,
                py: isCollapsed ? 1.5 : 1.25,
                px: isCollapsed ? 1 : 2,
                borderRadius: 1.5,
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                typography: 'body2',
                fontWeight: active ? 700 : 500,
                color: active ? 'primary.main' : 'text.secondary',
                bgcolor: active ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                '&:hover': {
                  bgcolor: active ? alpha(theme.palette.primary.main, 0.12) : theme.palette.action.hover,
                  color: active ? 'primary.dark' : 'text.primary'
                }
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: isCollapsed ? 0 : 32,
                  justifyContent: 'center',
                  color: active ? 'primary.main' : 'text.secondary',
                  '& svg': { width: 20, height: 20 }
                }}
              >
                <IconComponent />
              </ListItemIcon>
              {!isCollapsed && (
                <>
                  <ListItemText primary={t(item.labelKey)} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 'inherit' }} />
                  {item.id === 'fleet' && (
                    <Chip
                      label={hosts.length}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        bgcolor: active ? 'primary.main' : alpha(theme.palette.grey[500], 0.16),
                        color: active ? 'primary.contrastText' : 'text.secondary'
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
      <Box sx={{ pt: 2, borderTop: `1px solid ${theme.palette.divider}`, textAlign: 'center' }}>
        {!isCollapsed ? (
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 0.5 }}>
            <Box component="span" sx={{ color: 'primary.main', fontWeight: 800 }}>{settings.ownerSignature || '@nmhung1993'}</Box>
          </Typography>
        ) : (
          <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 800 }}>
            {settings.logoText || 'NMH'}
          </Typography>
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
            borderRightStyle: 'dashed',
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
