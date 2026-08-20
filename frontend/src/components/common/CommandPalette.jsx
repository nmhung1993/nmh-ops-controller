import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Dialog,
  Box,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Stack,
  Chip,
  Divider,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Search,
  Server,
  LayoutDashboard,
  Globe,
  Boxes,
  Activity,
  ShieldCheck,
  Terminal,
  History,
  Settings,
  Sun,
  Moon,
  Languages,
  LogOut,
  Zap,
  ArrowRight,
  Command
} from 'lucide-react';
import { useWebSocket } from '../../context/WebSocketContext';
import { useThemeMode } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import Label from './Label';

export default function CommandPalette({ open, onClose, onNavigate }) {
  const theme = useTheme();
  const { hosts, setSelectedHostId } = useWebSocket();
  const { mode, toggleTheme } = useThemeMode();
  const { lang, setLang, t } = useLanguage();
  const { logout } = useAuth();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Build searchable items
  const allItems = useMemo(() => {
    const items = [
      // Navigation Pages
      { id: 'nav_fleet', category: t('commandPalette.category.navigation'), title: t('commandPalette.nav.fleet'), icon: Server, action: () => onNavigate('fleet') },
      { id: 'nav_dashboard', category: t('commandPalette.category.navigation'), title: t('commandPalette.nav.dashboard'), icon: LayoutDashboard, action: () => onNavigate('dashboard') },
      { id: 'nav_network', category: t('commandPalette.category.navigation'), title: t('commandPalette.nav.network'), icon: Globe, action: () => onNavigate('network') },
      { id: 'nav_docker', category: t('commandPalette.category.navigation'), title: t('commandPalette.nav.docker'), icon: Boxes, action: () => onNavigate('docker') },
      { id: 'nav_processes', category: t('commandPalette.category.navigation'), title: t('commandPalette.nav.processes'), icon: Activity, action: () => onNavigate('processes') },
      { id: 'nav_watchdog', category: t('commandPalette.category.navigation'), title: t('commandPalette.nav.watchdog'), icon: ShieldCheck, action: () => onNavigate('watchdog') },
      { id: 'nav_scripts', category: t('commandPalette.category.navigation'), title: t('commandPalette.nav.scripts'), icon: Terminal, action: () => onNavigate('scripts') },
      { id: 'nav_activity', category: t('commandPalette.category.navigation'), title: t('commandPalette.nav.activity'), icon: History, action: () => onNavigate('activity') },
      { id: 'nav_admin', category: t('commandPalette.category.navigation'), title: t('commandPalette.nav.admin'), icon: Settings, action: () => onNavigate('admin') },

      // Quick Actions
      { id: 'act_theme', category: t('commandPalette.category.quickActions'), title: t('commandPalette.switchTheme', { mode: mode === 'dark' ? t('header.modeLight') : t('header.modeDark') }), icon: mode === 'dark' ? Sun : Moon, action: () => toggleTheme() },
      { id: 'act_lang', category: t('commandPalette.category.quickActions'), title: t('commandPalette.switchLang', { lang: lang === 'vi' ? 'English' : 'Tiếng Việt' }), icon: Languages, action: () => setLang(lang === 'vi' ? 'en' : 'vi') },
      { id: 'act_logout', category: t('commandPalette.category.quickActions'), title: t('commandPalette.logout'), icon: LogOut, action: () => logout() }
    ];

    // Add online / all hosts
    (hosts || []).forEach(h => {
      items.push({
        id: `host_${h.id}`,
        category: t('commandPalette.category.hosts'),
        title: `${h.hostname || h.id} (${h.ip_address || 'N/A'})`,
        subtitle: `${h.platform?.split(' ')[0] || 'OS'} • ${h.connected ? t('common.online') : t('common.offline')}`,
        icon: Server,
        badge: h.connected ? t('common.online') : t('common.offline'),
        badgeColor: h.connected ? 'success' : 'default',
        action: () => {
          setSelectedHostId(h.id);
          onNavigate('dashboard');
        }
      });
    });

    return items;
  }, [hosts, mode, lang, toggleTheme, setLang, logout, onNavigate, setSelectedHostId, t]);

  // Filter items
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(item => {
      const text = `${item.category} ${item.title} ${item.subtitle || ''}`.toLowerCase();
      return text.includes(q);
    });
  }, [allItems, query]);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          bgcolor: alpha(theme.palette.background.paper, 0.92),
          backdropFilter: 'blur(16px)',
          border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
          boxShadow: theme.shadows[12],
          overflow: 'hidden',
          mt: 8
        }
      }}
    >
      {/* Search Input */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Search size={20} color={theme.palette.primary.main} />
        <TextField
          inputRef={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
          onKeyDown={handleKeyDown}
          placeholder={t('commandPalette.placeholder')}
          variant="standard"
          fullWidth
          InputProps={{
            disableUnderline: true,
            sx: { fontSize: '0.95rem', fontWeight: 600 }
          }}
        />
        <Chip label="ESC" size="small" variant="outlined" sx={{ fontSize: '0.7rem', fontWeight: 700, height: 22 }} />
      </Box>

      {/* Results List */}
      <List sx={{ maxHeight: 380, overflowY: 'auto', p: 1 }}>
        {filteredItems.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {t('commandPalette.noResults')}
            </Typography>
          </Box>
        ) : (
          filteredItems.map((item, idx) => {
            const Icon = item.icon;
            const isSelected = idx === selectedIndex;

            return (
              <ListItemButton
                key={item.id}
                selected={isSelected}
                onClick={() => {
                  item.action();
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  py: 1,
                  px: 1.5,
                  bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.12)
                  }
                }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: isSelected ? 'primary.main' : 'text.secondary' }}>
                  <Icon size={18} />
                </ListItemIcon>

                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" sx={{ fontWeight: isSelected ? 700 : 600, color: isSelected ? 'primary.main' : 'text.primary' }}>
                        {item.title}
                      </Typography>
                      {item.badge && (
                        <Label variant="soft" color={item.badgeColor || 'default'} sx={{ fontSize: '0.65rem' }}>
                          {item.badge}
                        </Label>
                      )}
                    </Stack>
                  }
                  secondary={item.subtitle || item.category}
                  secondaryTypographyProps={{ fontSize: '0.75rem' }}
                />

                {isSelected && (
                  <ArrowRight size={16} color={theme.palette.primary.main} />
                )}
              </ListItemButton>
            );
          })
        )}
      </List>

      {/* Footer Helper */}
      <Box sx={{ p: 1.5, bgcolor: alpha(theme.palette.common.black, 0.03), borderTop: `1px solid ${theme.palette.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack direction="row" spacing={2} sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
          <span>↑↓ {t('commandPalette.tipNavigate')}</span>
          <span>↵ {t('commandPalette.tipSelect')}</span>
          <span>ESC {t('commandPalette.tipClose')}</span>
        </Stack>
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled' }}>
          {t('app.title')}
        </Typography>
      </Box>
    </Dialog>
  );
}
