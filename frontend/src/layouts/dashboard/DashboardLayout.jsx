import React, { useState, useEffect } from 'react';
import { Box, styled } from '@mui/material';
import Header, { HEADER_DESKTOP, HEADER_MOBILE } from './Header';
import NavSidebar, { NAV_WIDTH, NAV_COLLAPSED_WIDTH } from './NavSidebar';
import CommandPalette from '../../components/common/CommandPalette';

const Main = styled('main', {
  shouldForwardProp: (prop) => prop !== 'isCollapsed'
})(({ theme, isCollapsed }) => {
  const currentNavWidth = isCollapsed ? NAV_COLLAPSED_WIDTH : NAV_WIDTH;
  return {
    flexGrow: 1,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    paddingTop: HEADER_MOBILE + 8,
    paddingBottom: theme.spacing(4),
    paddingLeft: theme.spacing(1),
    paddingRight: theme.spacing(1),
    width: '100%',
    minWidth: 0,
    overflowX: 'hidden',
    transition: theme.transitions.create(['width', 'max-width'], {
      duration: theme.transitions.duration.shorter
    }),
    [theme.breakpoints.up('sm')]: {
      paddingTop: HEADER_MOBILE + 16,
      paddingLeft: theme.spacing(2.5),
      paddingRight: theme.spacing(2.5),
      paddingBottom: theme.spacing(6)
    },
    [theme.breakpoints.up('lg')]: {
      paddingTop: HEADER_DESKTOP + 16,
      paddingLeft: theme.spacing(3.5),
      paddingRight: theme.spacing(3.5),
      width: `calc(100% - ${currentNavWidth}px)`,
      maxWidth: `calc(100% - ${currentNavWidth}px)`
    }
  };
});


export default function DashboardLayout({ children, currentPage, onNavigate, onOpenPasswordDialog }) {
  const [openNav, setOpenNav] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('wc_sidebar_collapsed') === 'true';
  });

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('wc_sidebar_collapsed', String(next));
      return next;
    });
  };

  // Register Global Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', overflow: 'hidden', bgcolor: 'background.default' }}>
      <Header
        onOpenNav={() => setOpenNav(true)}
        currentPage={currentPage}
        onOpenPasswordDialog={onOpenPasswordDialog}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        isCollapsed={isCollapsed}
      />
      <NavSidebar
        openNav={openNav}
        onCloseNav={() => setOpenNav(false)}
        currentPage={currentPage}
        onNavigate={onNavigate}
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />
      <Main isCollapsed={isCollapsed}>{children}</Main>

      {/* Global Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={onNavigate}
      />
    </Box>
  );
}
