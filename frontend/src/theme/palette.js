import { alpha } from '@mui/material/styles';

// High-End Modern Operations Slate Color System
export const GREY = {
  0: '#FFFFFF',
  50: '#F8FAFC',
  100: '#F1F5F9',
  200: '#E2E8F0',
  300: '#CBD5E1',
  400: '#94A3B8',
  500: '#64748B',
  600: '#475569',
  700: '#334155',
  800: '#1E293B',
  850: '#131D2E',
  900: '#0F172A',
  950: '#0B0F17'
};

export const PRIMARY = {
  lighter: '#D1FAE5',
  light: '#6EE7B7',
  main: '#10B981',
  dark: '#059669',
  darker: '#047857',
  contrastText: '#FFFFFF'
};

export const SECONDARY = {
  lighter: '#EEF2FF',
  light: '#A5B4FC',
  main: '#6366F1',
  dark: '#4F46E5',
  darker: '#3730A3',
  contrastText: '#FFFFFF'
};

export const INFO = {
  lighter: '#E0F2FE',
  light: '#38BDF8',
  main: '#0284C7',
  dark: '#0369A1',
  darker: '#075985',
  contrastText: '#FFFFFF'
};

export const SUCCESS = {
  lighter: '#DCFCE7',
  light: '#4ADE80',
  main: '#16A34A',
  dark: '#15803D',
  darker: '#166534',
  contrastText: '#FFFFFF'
};

export const WARNING = {
  lighter: '#FEF3C7',
  light: '#FCD34D',
  main: '#F59E0B',
  dark: '#D97706',
  darker: '#B45309',
  contrastText: '#1E293B'
};

export const ERROR = {
  lighter: '#FEE2E2',
  light: '#F87171',
  main: '#EF4444',
  dark: '#DC2626',
  darker: '#991B1B',
  contrastText: '#FFFFFF'
};

export const COMMON = {
  common: { black: '#000000', white: '#FFFFFF' },
  primary: PRIMARY,
  secondary: SECONDARY,
  info: INFO,
  success: SUCCESS,
  warning: WARNING,
  error: ERROR,
  grey: GREY,
  divider: alpha(GREY[500], 0.16),
  action: {
    hover: alpha(GREY[500], 0.06),
    selected: alpha(GREY[500], 0.12),
    disabled: alpha(GREY[500], 0.38),
    disabledBackground: alpha(GREY[500], 0.12),
    focus: alpha(GREY[500], 0.18),
    hoverOpacity: 0.06,
    disabledOpacity: 0.38
  }
};

export function getPalette(themeMode) {
  const isLight = themeMode === 'light';

  const light = {
    ...COMMON,
    mode: 'light',
    text: {
      primary: GREY[900],
      secondary: GREY[600],
      disabled: GREY[400]
    },
    background: {
      paper: '#FFFFFF',
      default: '#F8FAFC',
      neutral: GREY[100],
      card: '#FFFFFF',
      surface: '#F1F5F9'
    },
    divider: 'rgba(148, 163, 184, 0.18)',
    action: {
      ...COMMON.action,
      active: GREY[700]
    }
  };

  const dark = {
    ...COMMON,
    mode: 'dark',
    text: {
      primary: '#F8FAFC',
      secondary: '#94A3B8',
      disabled: '#64748B'
    },
    background: {
      paper: '#111827',
      default: '#0B0F17',
      neutral: alpha(GREY[800], 0.6),
      card: '#111827',
      surface: '#1E293B'
    },
    divider: 'rgba(255, 255, 255, 0.08)',
    action: {
      ...COMMON.action,
      active: '#94A3B8'
    }
  };

  return isLight ? light : dark;
}

