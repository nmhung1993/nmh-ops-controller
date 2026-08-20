export function remToPx(value) {
  return Math.round(parseFloat(value) * 16);
}

export function pxToRem(value) {
  return `${value / 16}rem`;
}

export function responsiveFontSizes({ sm, md, lg }) {
  return {
    '@media (min-width:600px)': {
      fontSize: pxToRem(sm)
    },
    '@media (min-width:900px)': {
      fontSize: pxToRem(md)
    },
    '@media (min-width:1200px)': {
      fontSize: pxToRem(lg)
    }
  };
}

export const FONT_PRIMARY = '"Plus Jakarta Sans", "Inter", "Public Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
export const FONT_MONO = '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace';

export const typography = {
  fontFamily: FONT_PRIMARY,
  fontWeightRegular: 400,
  fontWeightMedium: 500,
  fontWeightSemiBold: 600,
  fontWeightBold: 700,
  h1: {
    fontWeight: 800,
    lineHeight: 1.15,
    letterSpacing: '-0.03em',
    fontSize: pxToRem(36),
    ...responsiveFontSizes({ sm: 44, md: 52, lg: 58 })
  },
  h2: {
    fontWeight: 800,
    lineHeight: 1.2,
    letterSpacing: '-0.025em',
    fontSize: pxToRem(28),
    ...responsiveFontSizes({ sm: 34, md: 38, lg: 42 })
  },
  h3: {
    fontWeight: 700,
    lineHeight: 1.25,
    letterSpacing: '-0.02em',
    fontSize: pxToRem(22),
    ...responsiveFontSizes({ sm: 24, md: 28, lg: 30 })
  },
  h4: {
    fontWeight: 700,
    lineHeight: 1.3,
    letterSpacing: '-0.015em',
    fontSize: pxToRem(18),
    ...responsiveFontSizes({ sm: 20, md: 22, lg: 24 })
  },
  h5: {
    fontWeight: 700,
    lineHeight: 1.35,
    letterSpacing: '-0.01em',
    fontSize: pxToRem(16),
    ...responsiveFontSizes({ sm: 17, md: 18, lg: 20 })
  },
  h6: {
    fontWeight: 700,
    lineHeight: 1.4,
    letterSpacing: '-0.005em',
    fontSize: pxToRem(14),
    ...responsiveFontSizes({ sm: 15, md: 16, lg: 17 })
  },
  subtitle1: {
    fontWeight: 600,
    lineHeight: 1.5,
    letterSpacing: '-0.005em',
    fontSize: pxToRem(15)
  },
  subtitle2: {
    fontWeight: 600,
    lineHeight: 1.5,
    letterSpacing: '0.005em',
    fontSize: pxToRem(13.5)
  },
  body1: {
    lineHeight: 1.6,
    letterSpacing: '0.005em',
    fontSize: pxToRem(14.5)
  },
  body2: {
    lineHeight: 1.55,
    letterSpacing: '0.01em',
    fontSize: pxToRem(13)
  },
  caption: {
    lineHeight: 1.45,
    letterSpacing: '0.02em',
    fontSize: pxToRem(11.5)
  },
  overline: {
    fontWeight: 700,
    lineHeight: 1.4,
    fontSize: pxToRem(11),
    textTransform: 'uppercase',
    letterSpacing: '0.12em'
  },
  button: {
    fontWeight: 700,
    lineHeight: 1.5,
    fontSize: pxToRem(13.5),
    textTransform: 'none',
    letterSpacing: '0.01em'
  }
};

