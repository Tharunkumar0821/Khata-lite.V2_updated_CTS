import { createContext, useContext } from 'react';
import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Design tokens
//
// Every screen reads sizes, spacing and type from here instead of hard-coding
// numbers, so the whole app can be re-proportioned from one file.
// ---------------------------------------------------------------------------

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

// One family, five sizes. Weights carry the hierarchy, not size jumps.
export const type = {
  amount: { fontSize: 27, fontWeight: '800', letterSpacing: -0.6 },
  title: { fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
  money: { fontSize: 16.5, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '500' },
  label: { fontSize: 13, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '500' },
};

export const light = {
  bg: '#f4f2ed',
  surface: '#ffffff',
  surfaceAlt: '#faf9f6',
  text: '#121b2c',
  muted: '#6a7387',
  faint: '#99a1b2',
  line: '#e4e0d6',
  lineSoft: '#efece4',
  brand: '#16345f',
  brandSoft: '#e8eef7',
  brandInk: '#ffffff',
  green: '#0b7a52',
  red: '#be2d36',
  greenBg: '#e4f3ec',
  redBg: '#fbe8e9',
  shadow: '#0f1b2d',
  overlay: 'rgba(10,16,27,0.55)',
};

export const dark = {
  bg: '#0d131e',
  surface: '#19222f',
  surfaceAlt: '#1f2936',
  text: '#eaf0fa',
  muted: '#93a0b8',
  faint: '#6d7a92',
  line: '#283447',
  lineSoft: '#212c3c',
  brand: '#6d9ce0',
  brandSoft: '#1c2a3f',
  brandInk: '#0a111c',
  green: '#44d094',
  red: '#ff8189',
  greenBg: '#123524',
  redBg: '#3a1b20',
  shadow: '#000000',
  overlay: 'rgba(4,8,14,0.66)',
};

// Cross-platform elevation. Android uses `elevation`, iOS needs the shadow
// quartet, and passing both keeps one call site for every raised surface.
export function elevate(colors, level = 1) {
  if (level === 0) return {};
  const map = {
    1: { radius: 6, offset: 2, opacity: 0.07 },
    2: { radius: 12, offset: 4, opacity: 0.1 },
    3: { radius: 22, offset: 8, opacity: 0.16 },
  };
  const s = map[level] || map[1];
  return Platform.OS === 'android'
    ? { elevation: level * 3, shadowColor: colors.shadow }
    : {
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: s.offset },
        shadowOpacity: s.opacity,
        shadowRadius: s.radius,
      };
}

export const ThemeContext = createContext(light);
export const useTheme = () => useContext(ThemeContext);
