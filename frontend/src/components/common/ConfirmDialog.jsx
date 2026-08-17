import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button
} from '@mui/material';
import { useLanguage } from '../../context/LanguageContext';

export default function ConfirmDialog({
  open,
  title,
  content,
  confirmText,
  cancelText,
  color = 'primary',
  onConfirm,
  onClose,
  loading = false
}) {
  const { t } = useLanguage();

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1, typography: 'h6' }}>{title}</DialogTitle>
      {content && (
        <DialogContent sx={{ pb: 2 }}>
          <DialogContentText sx={{ color: 'text.secondary', typography: 'body2' }}>
            {content}
          </DialogContentText>
        </DialogContent>
      )}
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={loading} variant="outlined" color="inherit">
          {cancelText || t('common.cancel')}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading}
          variant="contained"
          color={color}
          autoFocus
        >
          {confirmText || t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
