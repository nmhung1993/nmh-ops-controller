import React, { useMemo } from 'react';
import { createTheme, ThemeProvider as MUIThemeProvider, StyledEngineProvider, CssBaseline } from '@mui/material';
import { getPalette } from './palette';
import { typography } from './typography';
import { createShadows, createCustomShadows } from './shadows';
import { componentsOverrides } from './components';

export default function ThemeProvider({ themeMode = 'dark', themeColor = 'emerald', children }) {
  const theme = useMemo(() => {
    const palette = getPalette(themeMode, themeColor);
    const shadows = createShadows(themeMode === 'light' ? '#919EAB' : '#000000');
    const customShadows = createCustomShadows(themeMode === 'light' ? '#919EAB' : '#000000', palette.primary.main);

    const themeOptions = {
      palette,
      typography,
      shape: { borderRadius: 8 },
      shadows,
      customShadows
    };

    const baseTheme = createTheme(themeOptions);
    baseTheme.customShadows = customShadows;
    baseTheme.components = componentsOverrides(baseTheme);

    return baseTheme;
  }, [themeMode, themeColor]);


  return (
    <StyledEngineProvider injectFirst>
      <MUIThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MUIThemeProvider>
    </StyledEngineProvider>
  );
}
