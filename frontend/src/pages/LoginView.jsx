import React, { useState } from 'react';
import { Stack, TextField, Button, Alert, IconButton, InputAdornment } from '@mui/material';
import { Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../layouts/auth/AuthLayout';

export default function LoginView() {
  const { t } = useLanguage();
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message === 'Invalid credentials' ? t('error.Invalid credentials') || 'Tên đăng nhập hoặc mật khẩu không chính xác.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t('login.eyebrow')} subtitle="NMH Ops">
      <form onSubmit={handleSubmit}>
        <Stack spacing={2.5}>
          {error && <Alert severity="error" sx={{ borderRadius: 1.5 }}>{error}</Alert>}

          <TextField
            label={t('login.username')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            fullWidth
            autoFocus
          />

          <TextField
            label={t('login.password')}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
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
            {loading ? '...' : t('login.submit')}
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
}
