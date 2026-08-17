import React from 'react';
import { Box, Card, Typography, Button, Stack } from '@mui/material';
import { AlertTriangle, RotateCcw } from 'lucide-react';

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

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ p: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
          <Card sx={{ p: 4, maxWidth: 520, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2.5 }}>
            <Box sx={{ color: 'warning.main', mb: 2, display: 'flex', justifyContent: 'center' }}>
              <AlertTriangle size={48} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
              Đã xảy ra lỗi hiển thị
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
              {this.state.error?.message || 'Không thể hiển thị thành phần này.'}
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="center">
              <Button
                variant="contained"
                color="primary"
                startIcon={<RotateCcw size={16} />}
                onClick={this.handleReset}
                sx={{ fontWeight: 700 }}
              >
                Tải lại trang
              </Button>
            </Stack>
          </Card>
        </Box>
      );
    }

    return this.props.children;
  }
}
