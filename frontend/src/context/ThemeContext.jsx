import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const ThemeContext = createContext({
  themeMode: 'light',
  toggleTheme: () => {},
  setThemeMode: () => {}
});

export function ThemeModeProvider({ children }) {
  const [themeMode, setThemeModeState] = useState(() => {
    const saved = localStorage.getItem('wc_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const setThemeMode = useCallback((mode) => {
    const valid = mode === 'dark' ? 'dark' : 'light';
    setThemeModeState(valid);
    localStorage.setItem('wc_theme', valid);
    document.documentElement.dataset.theme = valid;
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeMode(themeMode === 'light' ? 'dark' : 'light');
  }, [themeMode, setThemeMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  return (
    <ThemeContext.Provider value={{ themeMode, toggleTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeMode() {
  return useContext(ThemeContext);
}
