export type ReaderThemeId = 'night' | 'day' | 'sepia';

export interface ReaderThemeColors {
  bg: string;
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
    bg: '#121212',
    text: '#ECEDEE',
    controlsBg: 'rgba(18, 18, 18, 0.4)',
    border: 'rgba(255, 255, 255, 0.10)',
    icon: '#ECEDEE',
    label: '#9BA1A6',
    accent: '#FFFFFF',
    panelBg: '#1A1A1C',
    panelText: '#ECEDEE',
    panelSubtext: '#9BA1A6',
    pillActive: '#121212',
    pillActiveFg: '#FFFFFF',
  },
  day: {
    bg: '#F2F2F2',
    text: '#121212',
    controlsBg: 'rgba(242, 242, 242, 0.4)',
    border: 'rgba(0, 0, 0, 0.08)',
    icon: '#121212',
    label: '#687076',
    accent: '#121212',
    panelBg: '#FFFFFF',
    panelText: '#121212',
    panelSubtext: '#687076',
    pillActive: '#121212',
    pillActiveFg: '#FFFFFF',
  },
  sepia: {
    bg: '#F5ECE3',
    text: '#433422',
    controlsBg: 'rgba(245, 236, 227, 0.4)',
    border: 'rgba(67, 52, 34, 0.12)',
    icon: '#433422',
    label: '#7A6040',
    accent: '#433422',
    panelBg: '#FAF5EF',
    panelText: '#433422',
    panelSubtext: '#7A6040',
    pillActive: '#433422',
    pillActiveFg: '#FFFFFF',
  },
};
