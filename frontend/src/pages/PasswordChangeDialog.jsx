import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
  Alert,
  Typography,
  IconButton,
  InputAdornment
} from '@mui/material';
import { Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../utils/api';

export default function PasswordChangeDialog({ open, onClose, isRequired = false }) {
  const { t } = useLanguage();
  const { user, updateUser } = useAuth();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 10) {
      setError(t('user.password') || 'Mật khẩu phải có tối thiểu 10 ký tự');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await apiRequest(`/api/v1/users/${user?.username}/password`, {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      updateUser({ mustChangePassword: false });
      setPassword('');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={isRequired ? undefined : onClose} maxWidth="xs" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ typography: 'h6', pb: 1 }}>{t('password.title')}</DialogTitle>
        <DialogContent sx={{ pb: 2 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
            {isRequired ? t('password.description') : t('user.passwordOptional')}
          </Typography>

          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label={t('password.new')}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              autoFocus
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          {!isRequired && (
            <Button onClick={onClose} disabled={loading} color="inherit">
              {t('common.cancel')}
            </Button>
          )}
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? '...' : t('password.update')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
