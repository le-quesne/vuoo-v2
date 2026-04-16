// Vuoo brand tokens — mirror de los tokens CSS del web (src/index.css)

export const colors = {
  // Primary (acento azul)
  primary: '#3b82f6',      // blue-500
  primaryLight: '#60a5fa', // blue-400
  primaryDark: '#2563eb',  // blue-600
  primaryBgSoft: 'rgba(59, 130, 246, 0.15)',

  // Navy — fondos oscuros (web custom palette)
  navy950: '#0a0e1a',
  navy900: '#0f1629',
  navy800: '#162038',
  navy700: '#1e2d4a',
  navy600: '#2a3d5e',

  // Neutrals claros (slate)
  bg: '#f8fafc',         // slate-50
  card: '#ffffff',
  cardElev: '#ffffff',
  border: '#e2e8f0',     // slate-200
  borderStrong: '#cbd5e1', // slate-300
  text: '#0f172a',       // slate-900
  textMuted: '#64748b',  // slate-500
  textLight: '#94a3b8',  // slate-400
  textOnDark: '#f1f5f9', // slate-100

  // Semánticos
  success: '#10b981',
  successBg: '#ecfdf5',
  warning: '#f59e0b',
  warningBg: '#fffbeb',
  danger: '#ef4444',
  dangerBg: '#fef2f2',
  info: '#3b82f6',
  infoBg: '#eff6ff',
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
}

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
}

export const typography = {
  display: 'System', // Sora en web; en mobile dejamos system until font is bundled
  sans: 'System',    // Inter en web
}

export const shadow = {
  card: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  elevated: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
}
