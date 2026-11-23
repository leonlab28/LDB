import { useColorScheme } from 'react-native';

const light = {
  bg: '#F6F4F0',
  card: '#FFFFFF',
  text: '#1C1B1A',
  muted: '#6F6B66',
  border: '#E4E0DA',
  accent: '#D9480F',
  accentText: '#FFFFFF',
  danger: '#C92A2A',
};

const dark: typeof light = {
  bg: '#121110',
  card: '#1E1C1A',
  text: '#F2EFEA',
  muted: '#A19C95',
  border: '#33302C',
  accent: '#FF8A4C',
  accentText: '#1C1B1A',
  danger: '#FF6B6B',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const NOTE_COLORS = {
  yellow: '#FFE58A',
  pink: '#FFC2D4',
  blue: '#B9DCFF',
  green: '#C3F0C8',
} as const;
