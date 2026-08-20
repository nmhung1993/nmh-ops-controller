import React, { useState, useEffect } from 'react';
import {
  Button,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Stack,
  Box,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Download, Share, PlusSquare, Smartphone, CheckCircle, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export default function PwaInstallButton({ variant = 'icon', sx = {} }) {
  const theme = useTheme();
  const isLight = theme.palette.mode === 'light';
  const { lang, t } = useLanguage();

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [iosModalOpen, setIosModalOpen] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (already installed)
    const checkStandalone = () => {
      const isStandaloneMode = (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        document.referrer.includes('android-app://')
      );
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !window.MSStream;
    setIsIos(isIosDevice);

    // Listen for beforeinstallprompt event (Android / Chromium)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      console.log('[PWA] App successfully installed!');
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // If already installed and running standalone, do not show install button
  if (isStandalone) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isIos) {
      setIosModalOpen(true);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('[PWA] User accepted install prompt');
        setDeferredPrompt(null);
      }
    } else {
      // Fallback modal for browsers that don't emit beforeinstallprompt (e.g. desktop safari/firefox)
      setIosModalOpen(true);
    }
  };

  return (
    <>
      {variant === 'button' ? (
        <Button
          variant="outlined"
          color="primary"
          size="small"
          startIcon={<Download size={16} />}
          onClick={handleInstallClick}
          sx={{
            fontWeight: 700,
            borderRadius: 2,
            fontSize: '0.8125rem',
            borderColor: alpha(theme.palette.primary.main, 0.4),
            ...sx
          }}
        >
          {t('pwa.installApp')}
        </Button>
      ) : (
        <Tooltip title={t('pwa.installTooltip')}>
          <IconButton
            onClick={handleInstallClick}
            size="small"
            sx={{
              color: 'primary.main',
              bgcolor: isLight ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.16)',
              '&:hover': {
                bgcolor: isLight ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.28)'
              },
              ...sx
            }}
          >
            <Download size={18} />
          </IconButton>
        </Tooltip>
      )}

      {/* iOS / Browser Guided Installation Dialog */}
      <Dialog
        open={iosModalOpen}
        onClose={() => setIosModalOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            p: 1,
            backgroundImage: 'none'
          }
        }}
      >
        <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                bgcolor: 'primary.main',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)'
              }}
            >
              <Smartphone size={20} />
            </Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              {isIos ? t('pwa.iosTitle') : t('pwa.modalTitle')}
            </Typography>
          </Stack>
          <IconButton size="small" onClick={() => setIosModalOpen(false)}>
            <X size={18} />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ pt: 1.5 }}>
          {isIos ? (
            <Stack spacing={2}>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                {t('pwa.iosDesc')}
              </Typography>

              <Box sx={{ p: 1.75, borderRadius: 2, bgcolor: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', border: `1px solid ${theme.palette.divider}` }}>
                <Stack spacing={1.75}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ p: 0.75, borderRadius: 1.5, bgcolor: 'primary.main', color: '#fff', display: 'flex' }}>
                      <Share size={16} />
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                      {t('pwa.iosStep1')}
                    </Typography>
                  </Stack>

                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ p: 0.75, borderRadius: 1.5, bgcolor: 'info.main', color: '#fff', display: 'flex' }}>
                      <PlusSquare size={16} />
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                      {t('pwa.iosStep2')}
                    </Typography>
                  </Stack>

                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ p: 0.75, borderRadius: 1.5, bgcolor: 'success.main', color: '#fff', display: 'flex' }}>
                      <CheckCircle size={16} />
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                      {t('pwa.iosStep3')}
                    </Typography>
                  </Stack>
                </Stack>
              </Box>
            </Stack>
          ) : (
            <Stack spacing={1.5}>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                {t('pwa.generalDesc')}
              </Typography>
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button variant="contained" fullWidth onClick={() => setIosModalOpen(false)} sx={{ fontWeight: 700 }}>
            {t('pwa.gotIt')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
