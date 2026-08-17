import React, { useState } from 'react';
import { Box, styled } from '@mui/material';
import Header, { HEADER_DESKTOP, HEADER_MOBILE } from './Header';
import NavSidebar, { NAV_WIDTH, NAV_COLLAPSED_WIDTH } from './NavSidebar';

const Main = styled('main', {
  shouldForwardProp: (prop) => prop !== 'isCollapsed'
})(({ theme, isCollapsed }) => {
  const currentNavWidth = isCollapsed ? NAV_COLLAPSED_WIDTH : NAV_WIDTH;
  return {
    flexGrow: 1,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    paddingTop: HEADER_MOBILE + 20,
    paddingBottom: theme.spacing(8),
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
    width: '100%',
    minWidth: 0,
    overflowX: 'hidden',
    transition: theme.transitions.create(['width', 'max-width'], {
      duration: theme.transitions.duration.shorter
    }),
    [theme.breakpoints.up('sm')]: {
      paddingLeft: theme.spacing(3),
      paddingRight: theme.spacing(3)
    },
    [theme.breakpoints.up('lg')]: {
      paddingTop: HEADER_DESKTOP + 20,
      paddingLeft: theme.spacing(3.5),
      paddingRight: theme.spacing(3.5),
      width: `calc(100% - ${currentNavWidth}px)`,
      maxWidth: `calc(100% - ${currentNavWidth}px)`
    }
  };
});

export default function DashboardLayout({ children, currentPage, onNavigate, onOpenPasswordDialog }) {
  const [openNav, setOpenNav] = useState(false);
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

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', overflow: 'hidden', bgcolor: 'background.default' }}>
      <Header
        onOpenNav={() => setOpenNav(true)}
        currentPage={currentPage}
        onOpenPasswordDialog={onOpenPasswordDialog}
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
    </Box>
  );
}
