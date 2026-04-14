import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReaderThemeId, READER_THEMES } from '@/constants/reader-theme';
import type { BukReadiumPreferences } from '@/modules/buk-readium';

const PREFS_KEY = 'reader-prefs';

export interface ReaderPrefs {
  themeId: ReaderThemeId;
  fontSize: number;
  fontFamily: 'normal' | 'serif';
  lineHeight: number;
}

export const DEFAULT_PREFS: ReaderPrefs = {
  themeId: 'night',
  fontSize: 1.0,
  fontFamily: 'normal',
  lineHeight: 1.8,
};

export function prefsToReadium(p: ReaderPrefs): BukReadiumPreferences {
  const t = READER_THEMES[p.themeId];
  return {
    backgroundColor: t.bg,
    textColor: t.text,
    fontSize: p.fontSize,
    fontFamily: p.fontFamily === 'serif' ? 'serif' : undefined,
    lineHeight: p.lineHeight,
  };
}

export function useReaderPrefs() {
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(PREFS_KEY)
      .then((savedPrefsJson) => {
        if (cancelled) return;
        if (savedPrefsJson) {
          try {
            setPrefs((p) => ({ ...p, ...JSON.parse(savedPrefsJson) }));
          } catch {}
        }
        setIsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setIsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updatePrefs = useCallback((patch: Partial<ReaderPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { prefs, updatePrefs, isLoaded };
}
