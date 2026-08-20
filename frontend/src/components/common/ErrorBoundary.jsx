import React from 'react';
import { Box, Card, Typography, Button, Stack } from '@mui/material';
import { AlertTriangle, RotateCcw, Home, RefreshCw } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

function ErrorFallback({ error, onRetry, onGoHome, onReload }) {
  const { t } = useLanguage();

  return (
    <Box sx={{ p: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
      <Card sx={{ p: 4, maxWidth: 520, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2.5, boxShadow: 3 }}>
        <Box sx={{ color: 'warning.main', mb: 2, display: 'flex', justifyContent: 'center' }}>
          <AlertTriangle size={48} />
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
          {t('errorBoundary.title')}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
          {error?.message || t('errorBoundary.defaultMessage')}
        </Typography>
        <Stack direction="row" spacing={1.5} justifyContent="center" flexWrap="wrap" sx={{ gap: 1 }}>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<RefreshCw size={16} />}
            onClick={onRetry}
            sx={{ fontWeight: 700 }}
          >
            {t('errorBoundary.retry')}
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Home size={16} />}
            onClick={onGoHome}
            sx={{ fontWeight: 700 }}
          >
            {t('errorBoundary.goHome')}
          </Button>
          <Button
            variant="text"
            color="inherit"
            startIcon={<RotateCcw size={16} />}
            onClick={onReload}
            sx={{ fontWeight: 600 }}
          >
            {t('errorBoundary.reload')}
          </Button>
        </Stack>
      </Card>
    </Box>
  );
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  componentDidUpdate(prevProps) {
    // Automatically reset error boundary when user navigates to another page / tab
    if (this.state.hasError && (prevProps.resetKey !== this.props.resetKey || prevProps.children !== this.props.children)) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onNavigate) {
      this.props.onNavigate('fleet');
    } else {
      window.location.hash = '#fleet';
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.handleRetry}
          onGoHome={this.handleGoHome}
          onReload={this.handleReload}
        />
      );
    }

    return this.props.children;
  }
}
