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
  /** Primary buttons, loaders, links — replaces legacy UI blue (#4A90D9). */
  interactive: '#cf2f2f',
  /** Gem icons and highlights — replaces light blue gem accents. */
  gem: '#d4af37',
  /** Default machine gun / skin fallback tower color — replaces saturated blue. */
  towerMachineGun: '#b85c5c',
  /** Slow/freeze visual on units & projectiles — teal, not UI blue. */
  freezeTint: '#5dbeb3',
  /** Semi-transparent accent overlays (legacy rgba(74,144,217,*)). */
  accentRgba15: 'rgba(207, 47, 47, 0.15)',
  accentRgba22: 'rgba(207, 47, 47, 0.22)',
  accentRgba28: 'rgba(207, 47, 47, 0.28)',
  accentRgba40: 'rgba(207, 47, 47, 0.4)',
  /** Tower placement / range highlight borders (legacy bright blue outlines). */
  selectionGlow: '#e87373',
  selectionGlowStrong: '#cf2f2f',
  /** Deep card surfaces — replaces blue-tinted #16213e / #1f2c4a. */
  surfaceDeep: '#131922',
  surfaceDeepAlt: '#171f2a',
  surfaceElevated: '#1c2430',
} as const;

export type TacticalColorKey = keyof typeof TacticalTheme;
