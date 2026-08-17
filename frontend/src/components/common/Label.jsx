import React from 'react';
import { Box, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';

export default function Label({
  children,
  color = 'default',
  variant = 'soft',
  startIcon,
  endIcon,
  sx,
  ...other
}) {
  const theme = useTheme();
  const isLight = theme.palette.mode === 'light';

  const styleFilled = (colorKey) => ({
    color: theme.palette[colorKey].contrastText,
    backgroundColor: theme.palette[colorKey].main
  });

  const styleOutlined = (colorKey) => ({
    color: theme.palette[colorKey].main,
    backgroundColor: 'transparent',
    border: `1px solid ${theme.palette[colorKey].main}`
  });

  const styleSoft = (colorKey) => ({
    color: theme.palette[colorKey][isLight ? 'dark' : 'light'],
    backgroundColor: alpha(theme.palette[colorKey].main, 0.16)
  });

  const defaultStyle = {
    ...(variant === 'filled' && {
      color: isLight ? theme.palette.common.white : theme.palette.grey[800],
      backgroundColor: isLight ? theme.palette.grey[800] : theme.palette.common.white
    }),
    ...(variant === 'outlined' && {
      color: theme.palette.text.primary,
      backgroundColor: 'transparent',
      border: `1px solid ${alpha(theme.palette.grey[500], 0.32)}`
    }),
    ...(variant === 'soft' && {
      color: isLight ? theme.palette.grey[800] : theme.palette.grey[300],
      backgroundColor: alpha(theme.palette.grey[500], 0.16)
    })
  };

  const colorStyles =
    color === 'default'
      ? defaultStyle
      : {
          ...(variant === 'filled' && styleFilled(color)),
          ...(variant === 'outlined' && styleOutlined(color)),
          ...(variant === 'soft' && styleSoft(color))
        };

  return (
    <Box
      component="span"
      sx={{
        height: 24,
        minWidth: 24,
        lineHeight: 0,
        borderRadius: '6px',
        cursor: 'default',
        alignItems: 'center',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        justifyContent: 'center',
        padding: '0 8px',
        fontSize: '0.75rem',
        fontWeight: 700,
        ...colorStyles,
        ...sx
      }}
      {...other}
    >
      {startIcon && <Box sx={{ mr: 0.5, display: 'flex', '& svg': { width: 14, height: 14 } }}>{startIcon}</Box>}
      {children}
      {endIcon && <Box sx={{ ml: 0.5, display: 'flex', '& svg': { width: 14, height: 14 } }}>{endIcon}</Box>}
    </Box>
  );
}
