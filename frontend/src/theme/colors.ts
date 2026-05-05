export const TacticalTheme = {
  bg: '#07090d',
  bgElevated: '#0d1117',
  panel: '#131922',
  panelAlt: '#171f2a',
  border: '#2a313d',
  borderStrong: '#3a4454',
  text: '#e7ebf2',
  textMuted: '#9aa4b2',
  textSubtle: '#7f8998',
  accent: '#cf2f2f',
  accentPress: '#b42828',
  accentSoft: '#7f2323',
  success: '#8b1f1f',
  warning: '#a73535',
  danger: '#cf2f2f',
  black: '#000000',
  white: '#ffffff',
} as const;

export type TacticalColorKey = keyof typeof TacticalTheme;
