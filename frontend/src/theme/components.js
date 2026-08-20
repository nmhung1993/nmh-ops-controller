import { alpha } from '@mui/material/styles';
import { createCustomShadows } from './shadows';

export function componentsOverrides(theme) {
  const isLight = theme.palette.mode === 'light';
  const customShadows = theme.customShadows || createCustomShadows(isLight ? '#94A3B8' : '#000000');

  return {
    MuiCssBaseline: {
      styleOverrides: {
        '*': {
          boxSizing: 'border-box',
          margin: 0,
          padding: 0
        },
        html: {
          margin: 0,
          padding: 0,
          width: '100%',
          height: '100%',
          WebkitOverflowScrolling: 'touch',
          scrollBehavior: 'smooth'
        },
        body: {
          margin: 0,
          padding: 0,
          width: '100%',
          height: '100%',
          backgroundColor: theme.palette.background.default,
          color: theme.palette.text.primary,
          fontVariantNumeric: 'tabular-nums',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale'
        },
        '#root': {
          width: '100%',
          height: '100%'
        },
        '::-webkit-scrollbar': {
          width: 7,
          height: 7
        },
        '::-webkit-scrollbar-track': {
          background: 'transparent'
        },
        '::-webkit-scrollbar-thumb': {
          background: isLight ? 'rgba(148, 163, 184, 0.35)' : 'rgba(255, 255, 255, 0.12)',
          borderRadius: 8,
          '&:hover': {
            background: isLight ? 'rgba(148, 163, 184, 0.6)' : 'rgba(255, 255, 255, 0.24)'
          }
        },
        input: {
          '&[type=number]': {
            MozAppearance: 'textfield',
            '&::-webkit-outer-spin-button': {
              margin: 0,
              WebkitAppearance: 'none'
            },
            '&::-webkit-inner-spin-button': {
              margin: 0,
              WebkitAppearance: 'none'
            }
          }
        },
        img: {
          display: 'block',
          maxWidth: '100%'
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          position: 'relative',
          borderRadius: 16,
          boxShadow: isLight
            ? '0 1px 3px rgba(0,0,0,0.05), 0 10px 24px -10px rgba(15, 23, 42, 0.06)'
            : '0 2px 8px rgba(0,0,0,0.4), 0 16px 32px -12px rgba(0, 0, 0, 0.6)',
          border: `1px solid ${isLight ? 'rgba(226, 232, 240, 0.8)' : 'rgba(255, 255, 255, 0.08)'}`,
          backgroundColor: isLight ? '#FFFFFF' : '#111827',
          backgroundImage: 'none',
          transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1), border-color 200ms ease'
        }
      }
    },
    MuiCardHeader: {
      styleOverrides: {
        root: {
          padding: theme.spacing(2.5, 3, 0)
        }
      }
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: theme.spacing(2.5, 3)
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontWeight: 650,
          textTransform: 'none',
          boxShadow: 'none',
          transition: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
          '&:active': {
            transform: 'scale(0.98)'
          },
          '&:hover': {
            boxShadow: 'none'
          }
        },
        containedPrimary: {
          backgroundColor: theme.palette.primary.main,
          color: theme.palette.primary.contrastText,
          boxShadow: '0 2px 10px rgba(16, 185, 129, 0.25)',
          '&:hover': {
            backgroundColor: theme.palette.primary.dark,
            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
            transform: 'translateY(-1px)'
          }
        },
        containedInherit: {
          color: isLight ? theme.palette.grey[800] : theme.palette.common.white,
          backgroundColor: isLight ? alpha(theme.palette.grey[500], 0.08) : alpha(theme.palette.grey[500], 0.16),
          '&:hover': {
            backgroundColor: isLight ? alpha(theme.palette.grey[500], 0.16) : alpha(theme.palette.grey[500], 0.24)
          }
        },
        outlinedInherit: {
          borderColor: isLight ? 'rgba(203, 213, 225, 0.8)' : 'rgba(255, 255, 255, 0.12)',
          '&:hover': {
            backgroundColor: theme.palette.action.hover,
            borderColor: theme.palette.text.primary
          }
        },
        textInherit: {
          '&:hover': {
            backgroundColor: theme.palette.action.hover
          }
        }
      }
    },
    MuiPaper: {
      defaultProps: {
        elevation: 0
      },
      styleOverrides: {
        root: {
          backgroundImage: 'none'
        }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${theme.palette.divider}`,
          padding: theme.spacing(1.75, 2),
          fontVariantNumeric: 'tabular-nums'
        },
        head: {
          color: theme.palette.text.secondary,
          backgroundColor: isLight ? '#F8FAFC' : alpha(theme.palette.grey[900], 0.8),
          fontWeight: 650,
          fontSize: '0.8125rem',
          letterSpacing: '0.02em',
          textTransform: 'uppercase'
        }
      }
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color 150ms ease',
          '&.Mui-selected': {
            backgroundColor: alpha(theme.palette.primary.main, 0.08),
            '&:hover': {
              backgroundColor: alpha(theme.palette.primary.main, 0.12)
            }
          },
          '&:hover': {
            backgroundColor: isLight ? 'rgba(241, 245, 249, 0.6)' : 'rgba(255, 255, 255, 0.03)'
          }
        }
      }
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 20,
          boxShadow: isLight
            ? '0 20px 50px -12px rgba(15, 23, 42, 0.18)'
            : '0 25px 60px -15px rgba(0, 0, 0, 0.8)',
          border: `1px solid ${isLight ? 'rgba(226, 232, 240, 0.9)' : 'rgba(255, 255, 255, 0.1)'}`,
          backgroundImage: 'none'
        }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          transition: 'all 180ms ease',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: isLight ? 'rgba(203, 213, 225, 0.8)' : 'rgba(255, 255, 255, 0.12)'
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: isLight ? theme.palette.grey[400] : 'rgba(255, 255, 255, 0.28)'
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: theme.palette.primary.main,
            borderWidth: 1.5,
            boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.18)}`
          }
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 650,
          fontSize: '0.75rem',
          letterSpacing: '0.01em',
          transition: 'all 150ms ease'
        }
      }
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          height: 6,
          backgroundColor: isLight ? 'rgba(226, 232, 240, 0.7)' : 'rgba(255, 255, 255, 0.08)'
        },
        bar: {
          borderRadius: 6
        }
      }
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: isLight ? '#1E293B' : '#0F172A',
          color: '#FFFFFF',
          fontSize: '0.75rem',
          fontWeight: 500,
          padding: '6px 12px',
          borderRadius: 8,
          border: isLight ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 20px rgba(0, 0, 0, 0.2)'
        },
        arrow: {
          color: isLight ? '#1E293B' : '#0F172A'
        }
      }
    }
  };
}
