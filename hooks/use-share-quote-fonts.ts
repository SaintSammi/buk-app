import { useFonts } from 'expo-font';

export function useShareQuoteFonts() {
  const [fontsLoaded] = useFonts({
    'ShareFont-Manrope': require('../assets/share/Manrope-VariableFont_wght.ttf'),
    'ShareFont-Mozilla': require('../assets/share/MozillaHeadline-VariableFont_wdth,wght.ttf'),
    'ShareFont-NeuePower': require('../assets/share/NeuePower-Ultra.ttf'),
    'ShareFont-Passero': require('../assets/share/PasseroOne-Regular.ttf'),
  });

  return fontsLoaded;
}

export const SHARE_FONTS: { label: string; fontFamily: string }[] = [
  { label: 'Manrope',        fontFamily: 'ShareFont-Manrope' },
  { label: 'Mozilla',        fontFamily: 'ShareFont-Mozilla' },
  { label: 'NeuePower',      fontFamily: 'ShareFont-NeuePower' },
  { label: 'Passero One',    fontFamily: 'ShareFont-Passero' },
];
