import React, { useState } from 'react';
import { Stack, TextField, Button, Alert, IconButton, InputAdornment, Typography } from '@mui/material';
import { Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../layouts/auth/AuthLayout';

export default function SetupView() {
  const { t } = useLanguage();
  const { setupAdmin } = useAuth();

  const [username, setUsername] = useState('');
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
      await setupAdmin(username, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t('setup.eyebrow')} subtitle={t('setup.title')}>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
        {t('setup.description')}
      </Typography>

      <form onSubmit={handleSubmit}>
        <Stack spacing={2.5}>
          {error && <Alert severity="error" sx={{ borderRadius: 1.5 }}>{error}</Alert>}

          <TextField
            label={t('setup.username')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            fullWidth
            autoFocus
          />

          <TextField
            label={t('setup.password')}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            helperText={t('setup.password')}
            autoComplete="new-password"
            fullWidth
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

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={loading}
            sx={{ py: 1.5, fontSize: '0.9375rem', fontWeight: 700 }}
          >
            {loading ? '...' : t('setup.submit')}
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
}
