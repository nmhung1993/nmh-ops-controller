import React from 'react';
import { Box, Card, Typography, Button, Stack } from '@mui/material';
import { AlertTriangle, RotateCcw, Home, RefreshCw } from 'lucide-react';

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
        <Box sx={{ p: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
          <Card sx={{ p: 4, maxWidth: 520, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2.5, boxShadow: 3 }}>
            <Box sx={{ color: 'warning.main', mb: 2, display: 'flex', justifyContent: 'center' }}>
              <AlertTriangle size={48} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
              Đã xảy ra sự cố hiển thị trang này
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
              {this.state.error?.message || 'Không thể nạp thành phần giao diện hiện tại.'}
            </Typography>
            <Stack direction="row" spacing={1.5} justifyContent="center" flexWrap="wrap" sx={{ gap: 1 }}>
              <Button
                variant="outlined"
                color="primary"
                startIcon={<RefreshCw size={16} />}
                onClick={this.handleRetry}
                sx={{ fontWeight: 700 }}
              >
                Thử lại
              </Button>
              <Button
                variant="contained"
                color="primary"
                startIcon={<Home size={16} />}
                onClick={this.handleGoHome}
                sx={{ fontWeight: 700 }}
              >
                Về trang Máy trạm
              </Button>
              <Button
                variant="text"
                color="inherit"
                startIcon={<RotateCcw size={16} />}
                onClick={this.handleReload}
                sx={{ fontWeight: 600 }}
              >
                Tải lại
              </Button>
            </Stack>
          </Card>
        </Box>
      );
    }

    return this.props.children;
  }
}
