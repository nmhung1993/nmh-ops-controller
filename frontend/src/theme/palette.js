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

export const COLOR_PRESETS = [
  { id: 'emerald', name: 'Emerald', label: 'Ngọc lục bảo (Emerald)', main: '#10B981', light: '#34D399', lighter: '#D1FAE5', dark: '#059669', darker: '#047857' },
  { id: 'ocean', name: 'Ocean', label: 'Biển xanh (Ocean Blue)', main: '#0284C7', light: '#38BDF8', lighter: '#E0F2FE', dark: '#0369A1', darker: '#075985' },
  { id: 'indigo', name: 'Indigo', label: 'Tím Indigo (Royal Indigo)', main: '#6366F1', light: '#818CF8', lighter: '#EEF2FF', dark: '#4F46E5', darker: '#3730A3' },
  { id: 'purple', name: 'Purple', label: 'Tím đậm (Deep Purple)', main: '#8B5CF6', light: '#A78BFA', lighter: '#F3E8FF', dark: '#7C3AED', darker: '#5B21B6' },
  { id: 'amber', name: 'Amber', label: 'Hổ phách (Amber Orange)', main: '#F59E0B', light: '#FCD34D', lighter: '#FEF3C7', dark: '#D97706', darker: '#B45309' },
  { id: 'rose', name: 'Rose', label: 'Hồng Rose (Crimson Rose)', main: '#F43F5E', light: '#FB7185', lighter: '#FFE4E6', dark: '#E11D48', darker: '#9F1239' },
  { id: 'cyan', name: 'Cyan', label: 'Lam ngọc (Cyber Cyan)', main: '#06B6D4', light: '#22D3EE', lighter: '#CFFAFE', dark: '#0891B2', darker: '#155E75' },
  { id: 'slate', name: 'Slate', label: 'Xám đá (Slate Minimal)', main: '#475569', light: '#64748B', lighter: '#E2E8F0', dark: '#334155', darker: '#1E293B' }
];

export const DEFAULT_PRIMARY = COLOR_PRESETS[0];

// Helper to convert hex to RGB
function hexToRgb(hex) {
  const sanitized = hex.replace('#', '');
  if (sanitized.length === 3) {
    const r = parseInt(sanitized[0] + sanitized[0], 16);
    const g = parseInt(sanitized[1] + sanitized[1], 16);
    const b = parseInt(sanitized[2] + sanitized[2], 16);
    return [r, g, b];
  }
  const r = parseInt(sanitized.substring(0, 2), 16) || 16;
  const g = parseInt(sanitized.substring(2, 4), 16) || 185;
  const b = parseInt(sanitized.substring(4, 6), 16) || 129;
  return [r, g, b];
}

// Convert RGB to HEX
function rgbToHex(r, g, b) {
  const clamp = (val) => Math.max(0, Math.min(255, Math.round(val)));
  return `#${[clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

export function buildPrimaryColor(colorInput = '#10B981') {
  if (!colorInput) return DEFAULT_PRIMARY;

  // Check if it's a known preset ID
  const preset = COLOR_PRESETS.find(p => p.id === colorInput || p.main.toLowerCase() === colorInput.toLowerCase());
  if (preset) {
    return {
      lighter: preset.lighter,
      light: preset.light,
      main: preset.main,
      dark: preset.dark,
      darker: preset.darker,
      contrastText: '#FFFFFF'
    };
  }

  // Parse custom hex
  try {
    const [r, g, b] = hexToRgb(colorInput);
    return {
      lighter: rgbToHex(r + (255 - r) * 0.75, g + (255 - g) * 0.75, b + (255 - b) * 0.75),
      light: rgbToHex(r + (255 - r) * 0.35, g + (255 - g) * 0.35, b + (255 - b) * 0.35),
      main: colorInput.startsWith('#') ? colorInput : `#${colorInput}`,
      dark: rgbToHex(r * 0.8, g * 0.8, b * 0.8),
      darker: rgbToHex(r * 0.6, g * 0.6, b * 0.6),
      contrastText: (r * 0.299 + g * 0.587 + b * 0.114) > 186 ? '#1E293B' : '#FFFFFF'
    };
  } catch {
    return DEFAULT_PRIMARY;
  }
}

export const PRIMARY = DEFAULT_PRIMARY;

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

export function getPalette(themeMode = 'light', colorInput = '#10B981') {
  const isLight = themeMode === 'light';
  const primaryPalette = buildPrimaryColor(colorInput);

  const baseCommon = {
    ...COMMON,
    primary: primaryPalette
  };

  const light = {
    ...baseCommon,
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
    ...baseCommon,
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


