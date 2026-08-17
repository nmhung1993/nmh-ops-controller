import React from 'react';
import { Box, Card, Stack, Typography, Container, useTheme, IconButton, Tooltip, Menu, MenuItem } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Sun, Moon, Globe, Shield, Terminal, Cpu, Network } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useThemeMode } from '../../context/ThemeContext';

export default function AuthLayout({ title, subtitle, children }) {
  const theme = useTheme();
  const { lang, setLang, t } = useLanguage();
  const { themeMode, toggleTheme } = useThemeMode();
  const [anchorElLang, setAnchorElLang] = React.useState(null);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        bgcolor: 'background.default',
        position: 'relative'
      }}
    >
      {/* Top preferences dock */}
      <Stack
        direction="row"
        spacing={1}
        sx={{
          position: 'absolute',
          top: { xs: 16, sm: 24 },
          right: { xs: 16, sm: 24 },
          zIndex: 9
        }}
      >
        <Tooltip title={t('language.label')}>
          <IconButton
            onClick={(e) => setAnchorElLang(e.currentTarget)}
            sx={{ bgcolor: alpha(theme.palette.grey[500], 0.08) }}
          >
            <Globe size={18} />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={anchorElLang}
          open={Boolean(anchorElLang)}
          onClose={() => setAnchorElLang(null)}
          PaperProps={{ sx: { width: 140, p: 0.5, borderRadius: 2 } }}
        >
          <MenuItem
            selected={lang === 'vi'}
            onClick={() => {
              setLang('vi');
              setAnchorElLang(null);
            }}
          >
            🇻🇳 Tiếng Việt
          </MenuItem>
          <MenuItem
            selected={lang === 'en'}
            onClick={() => {
              setLang('en');
              setAnchorElLang(null);
            }}
          >
            🇺🇸 English
          </MenuItem>
        </Menu>

        <Tooltip title={themeMode === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark')}>
          <IconButton onClick={toggleTheme} sx={{ bgcolor: alpha(theme.palette.grey[500], 0.08) }}>
            {themeMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </IconButton>
        </Tooltip>
      </Stack>

      <Container maxWidth="xl" sx={{ display: 'flex', alignItems: 'center', minHeight: '100vh', py: { xs: 6, md: 8 } }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 4, md: 8 }}
          alignItems="center"
          justifyContent="center"
          sx={{ width: 1 }}
        >
          {/* Left Hero Story (Hidden on Mobile) */}
          <Box
            sx={{
              flex: 1,
              maxWidth: 520,
              display: { xs: 'none', md: 'block' },
              p: 4,
              borderRadius: 3,
              bgcolor: alpha(theme.palette.primary.main, 0.04),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: theme.customShadows.primary,
                  fontWeight: 800,
                  fontSize: '1.4rem'
                }}
              >
                WC
              </Box>
              <Box>
                <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: 1.2 }}>
                  WINDOWS FLEET / LAN
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>
                  Windows Controller
                </Typography>
              </Box>
            </Stack>

            <Typography variant="h4" sx={{ fontWeight: 800, mb: 2, lineHeight: 1.3 }}>
              {t('auth.storyTitle')}
            </Typography>

            <Typography variant="body1" sx={{ color: 'text.secondary', mb: 4, lineHeight: 1.6 }}>
              {t('auth.storyDescription')}
            </Typography>

            <Stack spacing={2}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main' }}>
                  <Cpu size={20} />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Real-time CPU, RAM & Hardware Sensors Telemetry
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha(theme.palette.success.main, 0.1), color: 'success.main' }}>
                  <Shield size={20} />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Edge Watchdog Local-First Self-Healing
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha(theme.palette.info.main, 0.1), color: 'info.main' }}>
                  <Network size={20} />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Centralized Multi-Host Fleet Management
                </Typography>
              </Stack>
            </Stack>
          </Box>

          {/* Right Auth Card */}
          <Box sx={{ width: 1, maxWidth: 460 }}>
            <Card
              sx={{
                p: { xs: 3, sm: 4.5 },
                borderRadius: 2.5,
                boxShadow: theme.customShadows.card
              }}
            >
              <Stack spacing={0.5} sx={{ mb: 3.5 }}>
                <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: 1.2 }}>
                  {title}
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                  {subtitle}
                </Typography>
              </Stack>

              {children}
            </Card>
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}
