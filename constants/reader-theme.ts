export type ReaderThemeId = 'night' | 'day' | 'sepia';

export interface ReaderThemeColors {
  bg: string;
  bgTransparent: string;
  text: string;
  controlsBg: string;
  border: string;
  icon: string;
  label: string;
  accent: string;
  panelBg: string;
  panelText: string;
  panelSubtext: string;
  pillActive: string;
  pillActiveFg: string;
}

export const READER_THEMES: Record<ReaderThemeId, ReaderThemeColors> = {
  night: {
    bg: '#0F0F0F',
    bgTransparent: 'rgba(15, 15, 15, 0)',
    text: '#FFFFFF',
    controlsBg: '#424242',
    border: 'rgba(255, 255, 255, 0.10)',
    icon: '#FFFFFF',
    label: '#FFFFFF',
    accent: '#FFFFFF',
    panelBg: '#1A1A1C',
    panelText: '#FFFFFF',
    panelSubtext: '#9BA1A6',
    pillActive: '#FFFFFF',
    pillActiveFg: '#0F0F0F',
  },
  day: {
    bg: '#FFFFFF',
    bgTransparent: 'rgba(255, 255, 255, 0)',
    text: '#0F0F0F',
    controlsBg: '#D5D3D3',
    border: 'rgba(0, 0, 0, 0.08)',
    icon: '#0F0F0F',
    label: '#0F0F0F',
    accent: '#0F0F0F',
    panelBg: '#FFFFFF',
    panelText: '#0F0F0F',
    panelSubtext: '#687076',
    pillActive: '#0F0F0F',
    pillActiveFg: '#FFFFFF',
  },
  sepia: {
    bg: '#F5ECE3',
    bgTransparent: 'rgba(245, 236, 227, 0)',
    text: '#2A2929',
    controlsBg: '#FFFFFF',
    border: 'rgba(67, 52, 34, 0.12)',
    icon: '#0F0F0F',
    label: '#0F0F0F',
    accent: '#0F0F0F',
    panelBg: '#FAF5EF',
    panelText: '#433422',
    panelSubtext: '#7A6040',
    pillActive: '#0F0F0F',
    pillActiveFg: '#FFFFFF',
  },
};
