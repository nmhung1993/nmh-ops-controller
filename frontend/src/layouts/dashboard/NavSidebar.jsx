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
  Radio
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useWebSocket } from '../../context/WebSocketContext';

export const NAV_ITEMS = [
  { id: 'fleet', path: '#fleet', labelKey: 'nav.fleet', icon: Server },
  { id: 'dashboard', path: '#dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { id: 'processes', path: '#processes', labelKey: 'nav.processes', icon: Activity },
  { id: 'watchdog', path: '#watchdog', labelKey: 'nav.watchdog', icon: ShieldCheck },
  { id: 'activity', path: '#activity', labelKey: 'nav.activity', icon: History },
  { id: 'admin', path: '#admin', labelKey: 'nav.admin', icon: Settings, superAdminOnly: true }
];

export const NAV_WIDTH = 280;

export default function NavSidebar({ openNav, onCloseNav, currentPage, onNavigate }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { isSuperAdmin } = useAuth();
  const { hosts } = useWebSocket();

  const onlineCount = hosts.filter((h) => h.online).length;
  const offlineCount = hosts.filter((h) => !h.online).length;

  const renderContent = (
    <Box
      sx={{
        height: 1,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderRight: `1px solid ${theme.palette.divider}`,
        px: 2.5,
        py: 3
      }}
    >
      {/* Brand Logo */}
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 4, px: 0.5, cursor: 'pointer' }} onClick={() => onNavigate('fleet')}>
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
            fontSize: '1.2rem',
            letterSpacing: -0.5
          }}
        >
          WC
        </Box>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.15 }}>
            Windows
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.8125rem' }}>
            Controller
          </Typography>
        </Box>
      </Stack>

      {/* Environment Badge */}
      <Box
        sx={{
          p: 1.75,
          mb: 3,
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

      {/* Fleet Pulse Stats */}
      <Stack
        direction="row"
        spacing={1}
        sx={{
          mb: 3,
          p: 1.5,
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

      {/* Navigation Links */}
      <List component="nav" sx={{ px: 0, flexGrow: 1 }}>
        {NAV_ITEMS.map((item) => {
          if (item.superAdminOnly && !isSuperAdmin) return null;

          const IconComponent = item.icon;
          const active = currentPage === item.id;

          return (
            <ListItemButton
              key={item.id}
              onClick={() => {
                onNavigate(item.id);
                if (onCloseNav) onCloseNav();
              }}
              sx={{
                mb: 0.75,
                py: 1.25,
                px: 2,
                borderRadius: 1.5,
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
                  minWidth: 32,
                  color: active ? 'primary.main' : 'text.secondary',
                  '& svg': { width: 20, height: 20 }
                }}
              >
                <IconComponent />
              </ListItemIcon>
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
            </ListItemButton>
          );
        })}
      </List>

      {/* Footer Info */}
      <Box sx={{ pt: 2, borderTop: `1px solid ${theme.palette.divider}`, textAlign: 'center' }}>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600, letterSpacing: 0.5 }}>
          CENTRAL NODE / <Box component="span" sx={{ color: 'primary.main', fontWeight: 700 }}>3003</Box>
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box component="nav" sx={{ flexShrink: { lg: 0 }, width: { lg: NAV_WIDTH } }}>
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
            width: NAV_WIDTH,
            bgcolor: 'background.paper',
            borderRightStyle: 'dashed'
          }
        }}
        sx={{ display: { xs: 'none', lg: 'block' } }}
      >
        {renderContent}
      </Drawer>
    </Box>
  );
}
