// constants/theme.ts
export const theme = {
  colors: {
    primary: '#ffd700',
    primaryDark: '#e6c200',
    background: '#f8f9fa',
    surface: '#ffffff',
    surfaceDark: '#1e1e1e',
    text: '#1a1a1a',
    textSecondary: '#666666',
    textMuted: '#999999',
    border: '#e0e0e0',
    borderDark: '#333333',
    draft: '#FF9800',
    finished: '#4CAF50',
    cover: '#2196F3',
    error: '#f44336',
    warning: '#FF9800',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 5,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 20,
      elevation: 8,
    },
  },
  typography: {
    h1: 28,
    h2: 24,
    h3: 20,
    h4: 18,
    body: 16,
    caption: 14,
    small: 12,
  },
} as const;

export type Theme = typeof theme;