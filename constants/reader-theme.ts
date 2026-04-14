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
    bg: '#1C1C1E',
    text: '#ECEDEE',
    controlsBg: 'rgba(20, 20, 22, 0.94)',
    border: 'rgba(255, 255, 255, 0.10)',
    icon: '#ECEDEE',
    label: '#9BA1A6',
    accent: '#5B9CF6',
    panelBg: '#1A1A1C',
    panelText: '#ECEDEE',
    panelSubtext: '#9BA1A6',
    pillActive: '#5B9CF6',
    pillActiveFg: '#FFFFFF',
  },
  day: {
    bg: '#FFFFFF',
    text: '#1A1A1A',
    controlsBg: 'rgba(255, 255, 255, 0.96)',
    border: 'rgba(0, 0, 0, 0.08)',
    icon: '#1A1A1A',
    label: '#687076',
    accent: '#0A7EA4',
    panelBg: '#F2F2F7',
    panelText: '#1A1A1A',
    panelSubtext: '#687076',
    pillActive: '#0A7EA4',
    pillActiveFg: '#FFFFFF',
  },
  sepia: {
    bg: '#F4EACB',
    text: '#3B2A1A',
    controlsBg: 'rgba(244, 234, 203, 0.96)',
    border: 'rgba(59, 42, 26, 0.12)',
    icon: '#3B2A1A',
    label: '#7A6040',
    accent: '#8B5E3C',
    panelBg: '#EAD9B2',
    panelText: '#3B2A1A',
    panelSubtext: '#7A6040',
    pillActive: '#8B5E3C',
    pillActiveFg: '#FFFFFF',
  },
};
