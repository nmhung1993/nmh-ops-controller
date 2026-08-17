import React, { useState } from 'react';
import { Box, styled } from '@mui/material';
import Header, { HEADER_DESKTOP, HEADER_MOBILE, NAV_WIDTH } from './Header';
import NavSidebar from './NavSidebar';

const Main = styled('main', {
  shouldForwardProp: (prop) => prop !== 'open'
})(({ theme }) => ({
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
  [theme.breakpoints.up('sm')]: {
    paddingLeft: theme.spacing(3),
    paddingRight: theme.spacing(3)
  },
  [theme.breakpoints.up('lg')]: {
    paddingTop: HEADER_DESKTOP + 20,
    paddingLeft: theme.spacing(3.5),
    paddingRight: theme.spacing(3.5),
    width: `calc(100% - ${NAV_WIDTH}px)`,
    maxWidth: `calc(100% - ${NAV_WIDTH}px)`
  }
}));

export default function DashboardLayout({ children, currentPage, onNavigate, onOpenPasswordDialog }) {
  const [openNav, setOpenNav] = useState(false);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', overflow: 'hidden', bgcolor: 'background.default' }}>
      <Header
        onOpenNav={() => setOpenNav(true)}
        currentPage={currentPage}
        onOpenPasswordDialog={onOpenPasswordDialog}
      />
      <NavSidebar
        openNav={openNav}
        onCloseNav={() => setOpenNav(false)}
        currentPage={currentPage}
        onNavigate={onNavigate}
      />
      <Main>{children}</Main>
    </Box>
  );
}
