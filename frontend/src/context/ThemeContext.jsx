import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { COLOR_PRESETS } from '../theme/palette';

const ThemeContext = createContext({
  themeMode: 'light',
  themeColor: 'emerald',
  toggleTheme: () => {},
  setThemeMode: () => {},
  setThemeColor: () => {},
  resetTheme: () => {}
});

export function ThemeModeProvider({ children }) {
  const [themeMode, setThemeModeState] = useState(() => {
    const saved = localStorage.getItem('wc_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'dark';
  });

  const [themeColor, setThemeColorState] = useState(() => {
    return localStorage.getItem('wc_theme_color') || 'emerald';
  });

  const setThemeMode = useCallback((mode) => {
    const valid = mode === 'light' ? 'light' : 'dark';
    setThemeModeState(valid);
    localStorage.setItem('wc_theme', valid);
    document.documentElement.dataset.theme = valid;
  }, []);

  const setThemeColor = useCallback((color) => {
    if (!color) return;
    setThemeColorState(color);
    localStorage.setItem('wc_theme_color', color);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeMode(themeMode === 'light' ? 'dark' : 'light');
  }, [themeMode, setThemeMode]);

  const resetTheme = useCallback(() => {
    setThemeMode('dark');
    setThemeColor('emerald');
  }, [setThemeMode, setThemeColor]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        themeColor,
        toggleTheme,
        setThemeMode,
        setThemeColor,
        resetTheme,
        colorPresets: COLOR_PRESETS
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeMode() {
  return useContext(ThemeContext);
}

