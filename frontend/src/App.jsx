import React, { useState, useEffect } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { ThemeModeProvider, useThemeMode } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';
import { SystemSettingsProvider } from './context/SystemSettingsContext';
import ThemeProvider from './theme';

import DashboardLayout from './layouts/dashboard/DashboardLayout';
import FleetView from './pages/FleetView';
import DashboardView from './pages/DashboardView';
import ProcessesView from './pages/ProcessesView';
import WatchdogView from './pages/WatchdogView';
import ActivityView from './pages/ActivityView';
import AdminView from './pages/AdminView';
import NetworkMonitorView from './pages/NetworkMonitorView';
import DockerView from './pages/DockerView';
import ScriptHubView from './pages/ScriptHubView';
import LoginView from './pages/LoginView';
import SetupView from './pages/SetupView';
import PasswordChangeDialog from './pages/PasswordChangeDialog';
import ErrorBoundary from './components/common/ErrorBoundary';

function MainApp() {
  const { user, token, isSetupRequired, isLoading, isSuperAdmin } = useAuth();
  const ALL_PAGES = ['network', 'docker', 'fleet', 'dashboard', 'processes', 'watchdog', 'scripts', 'activity', 'admin'];

  const isPageAllowed = (page) => {
    if (page === 'admin') return isSuperAdmin;
    if (isSuperAdmin) return true;
    if (user?.permissions?.pages && user.permissions.pages[page] === false) return false;
    return true;
  };

  const [currentPage, setCurrentPage] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    return ALL_PAGES.includes(hash) ? hash : 'fleet';
  });

  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  // Sync hash navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (ALL_PAGES.includes(hash) && isPageAllowed(hash)) {
        setCurrentPage(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [user, isSuperAdmin]);

  // Ensure current page is allowed
  useEffect(() => {
    if (user && !isPageAllowed(currentPage)) {
      const firstAllowed = ALL_PAGES.find(p => isPageAllowed(p)) || 'fleet';
      setCurrentPage(firstAllowed);
      window.location.hash = `#${firstAllowed}`;
    }
  }, [currentPage, user, isSuperAdmin]);

  const handleNavigate = (page) => {
    if (isPageAllowed(page)) {
      setCurrentPage(page);
      window.location.hash = `#${page}`;
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: 'background.default' }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (isSetupRequired) {
    return <SetupView />;
  }

  if (!token || !user) {
    return <LoginView />;
  }

  return (
    <WebSocketProvider>
      <DashboardLayout
        currentPage={currentPage}
        onNavigate={handleNavigate}
        onOpenPasswordDialog={() => setPasswordDialogOpen(true)}
      >
        <ErrorBoundary key={currentPage} resetKey={currentPage} onNavigate={handleNavigate}>
          {currentPage === 'fleet' && <FleetView onNavigate={handleNavigate} />}
          {currentPage === 'dashboard' && <DashboardView />}
          {currentPage === 'network' && <NetworkMonitorView />}
          {currentPage === 'docker' && <DockerView />}
          {currentPage === 'processes' && <ProcessesView />}
          {currentPage === 'watchdog' && <WatchdogView />}
          {currentPage === 'scripts' && <ScriptHubView />}
          {currentPage === 'activity' && <ActivityView />}
          {currentPage === 'admin' && <AdminView />}
        </ErrorBoundary>
      </DashboardLayout>

      {/* Password Change Dialog */}
      <PasswordChangeDialog
        open={user.mustChangePassword || passwordDialogOpen}
        isRequired={user.mustChangePassword}
        onClose={() => setPasswordDialogOpen(false)}
      />
    </WebSocketProvider>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <ThemeModeProvider>
        <SystemSettingsProvider>
          <AppWithTheme />
        </SystemSettingsProvider>
      </ThemeModeProvider>
    </LanguageProvider>
  );
}

function AppWithTheme() {
  const { themeMode, themeColor } = useThemeMode();

  return (
    <ThemeProvider themeMode={themeMode} themeColor={themeColor}>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ThemeProvider>
  );
}

