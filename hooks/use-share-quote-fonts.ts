import * as Font from 'expo-font';
import { useState, useEffect } from 'react';

const FONT_ASSETS: Record<string, ReturnType<typeof require>> = {
  'ShareFont-Manrope':   require('../assets/share/Manrope-VariableFont_wght.ttf'),
  'ShareFont-Playfair':  require('../assets/share/PlayfairDisplay-Bold.ttf'),
  'ShareFont-Passero':   require('../assets/share/PasseroOne-Regular.ttf'),
  'ShareFont-NeuePower': require('../assets/share/NeuePower-Ultra.ttf'),
  'ShareFont-Mozilla':   require('../assets/share/MozillaHeadline-Bold.ttf'),
};

// Loaded set is keyed by fontFamily string
let _cached: Set<string> | null = null;

export function useShareQuoteFonts(): Set<string> {
  const [loadedFonts, setLoadedFonts] = useState<Set<string>>(_cached ?? new Set());

  useEffect(() => {
    if (_cached) return;
    Promise.allSettled(
      Object.entries(FONT_ASSETS).map(([name, asset]) =>
        Font.loadAsync({ [name]: asset })
          .then(() => name)
          .catch((e) => { console.warn(`[ShareFont] failed to load: ${name}`, e); return null; })
      )
    ).then((results) => {
      const loaded = new Set<string>(
        results
          .map((r) => (r.status === 'fulfilled' ? r.value : null))
          .filter((n): n is string => n !== null)
      );
      _cached = loaded;
      setLoadedFonts(loaded);
    });
  }, []);

  return loadedFonts;
}

export const SHARE_FONTS: { label: string; fontFamily: string }[] = [
  { label: 'Manrope',          fontFamily: 'ShareFont-Manrope'   },
  { label: 'Playfair Display', fontFamily: 'ShareFont-Playfair'  },
  { label: 'Passero One',      fontFamily: 'ShareFont-Passero'   },
  { label: 'Neue Power',       fontFamily: 'ShareFont-NeuePower' },
  { label: 'Mozilla Headline', fontFamily: 'ShareFont-Mozilla'   },
];
