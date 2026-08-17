import { alpha } from '@mui/material/styles';
import { createCustomShadows } from './shadows';

export function componentsOverrides(theme) {
  const isLight = theme.palette.mode === 'light';
  const customShadows = theme.customShadows || createCustomShadows(isLight ? '#919EAB' : '#000000');

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
          WebkitOverflowScrolling: 'touch'
        },
        body: {
          margin: 0,
          padding: 0,
          width: '100%',
          height: '100%',
          backgroundColor: theme.palette.background.default,
          color: theme.palette.text.primary
        },
        '#root': {
          width: '100%',
          height: '100%'
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
          boxShadow: customShadows.card,
          border: `1px solid ${isLight ? alpha(theme.palette.grey[500], 0.12) : alpha(theme.palette.grey[500], 0.16)}`,
          backgroundImage: 'none',
          transition: 'box-shadow 300ms cubic-bezier(0.4, 0, 0.2, 1) 0ms'
        }
      }
    },
    MuiCardHeader: {
      styleOverrides: {
        root: {
          padding: theme.spacing(3, 3, 0)
        }
      }
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: theme.spacing(3)
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 700,
          textTransform: 'none',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none'
          }
        },
        containedPrimary: {
          backgroundColor: theme.palette.primary.main,
          color: theme.palette.primary.contrastText,
          boxShadow: customShadows.primary,
          '&:hover': {
            backgroundColor: theme.palette.primary.dark
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
          borderColor: alpha(theme.palette.grey[500], 0.32),
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
          padding: theme.spacing(1.75, 2)
        },
        head: {
          color: theme.palette.text.secondary,
          backgroundColor: isLight ? theme.palette.grey[100] : alpha(theme.palette.grey[800], 0.6),
          fontWeight: 600,
          fontSize: '0.875rem'
        }
      }
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            backgroundColor: alpha(theme.palette.primary.main, 0.08),
            '&:hover': {
              backgroundColor: alpha(theme.palette.primary.main, 0.12)
            }
          },
          '&:hover': {
            backgroundColor: theme.palette.action.hover
          }
        }
      }
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          boxShadow: customShadows.dialog,
          border: `1px solid ${theme.palette.divider}`
        }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha(theme.palette.grey[500], 0.2)
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: theme.palette.text.primary
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: theme.palette.primary.main
          }
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 600
        }
      }
    }
  };
}
