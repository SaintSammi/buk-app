import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReaderThemeId, READER_THEMES } from '@/constants/reader-theme';
import type { ReaderPrefs } from '@/hooks/use-reader-prefs';
import { ReaderSlider } from './reader-slider';

interface ReaderSettingsProps {
  prefs: ReaderPrefs;
  updatePrefs: (patch: Partial<ReaderPrefs>) => void;
}

export function ReaderSettings({ prefs, updatePrefs }: ReaderSettingsProps) {
  const insets = useSafeAreaInsets();
  const theme = READER_THEMES[prefs.themeId];

  return (
    <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 24) + 120 }]}>
      {/* 120 padding bottom accounts for the floating controls layout overlapping */}

      {/* Font Size Slider */}
      <View style={styles.sliderRow}>
        <ReaderSlider
          value={prefs.fontSize}
          min={0.8}
          max={2.0}
          steps={5}
          onChange={(val) => updatePrefs({ fontSize: val })}
          activeColor={theme.accent}
          inactiveColor={theme.border}
          dotColor={theme.panelBg}
          leftIcon={<Text style={[styles.sliderIconText, { color: theme.icon, fontSize: 13, fontWeight: '700' }]}>A</Text>}
          rightIcon={<Text style={[styles.sliderIconText, { color: theme.icon, fontSize: 18, fontWeight: '700' }]}>A</Text>}
        />
      </View>

      {/* Brightness Slider */}
      <View style={styles.sliderRow}>
        <ReaderSlider
          value={prefs.brightness}
          min={0.0}
          max={1.0}
          steps={5}
          onChange={(val) => updatePrefs({ brightness: val })}
          activeColor={theme.accent}
          inactiveColor={theme.border}
          dotColor={theme.panelBg}
          leftIcon={<Feather name="sun" size={16} color={theme.icon} />}
          rightIcon={<Feather name="sun" size={22} color={theme.icon} />}
        />
      </View>

      {/* Theme Selectors */}
      <View style={styles.themeRow}>
        <Pressable
          style={[
            styles.themeBtn,
            { backgroundColor: '#121212' },
            prefs.themeId === 'night' && styles.themeBtnActive,
            prefs.themeId === 'night' && { borderColor: theme.accent },
          ]}
          onPress={() => updatePrefs({ themeId: 'night' })}
        >
          <Text style={[styles.themeBtnText, { color: '#FFFFFF' }]}>Aa</Text>
        </Pressable>

        <Pressable
          style={[
            styles.themeBtn,
            { backgroundColor: '#444444' }, // Dark grey
            prefs.themeId === 'day' && styles.themeBtnActive, // Wait! Is 'day' white or dark grey?
            // Actually, in the screenshot, the center is maybe a dark mode contrast. Let's make Day = White, Night = Dark, Sepia = Beige.
            // In the user's design, maybe Day mode has a custom black button? Let's just use White, Black, Sepia colors mapping to standard themes.
            { backgroundColor: '#ECEDEE' }, // Day Theme
            prefs.themeId === 'day' && styles.themeBtnActive,
            prefs.themeId === 'day' && { borderColor: theme.accent },
          ]}
          onPress={() => updatePrefs({ themeId: 'day' })}
        >
          <Text style={[styles.themeBtnText, { color: '#121212' }]}>Aa</Text>
        </Pressable>

        <Pressable
          style={[
            styles.themeBtn,
            { backgroundColor: '#F5D6B6' },
            prefs.themeId === 'sepia' && styles.themeBtnActive,
            prefs.themeId === 'sepia' && { borderColor: theme.accent },
          ]}
          onPress={() => updatePrefs({ themeId: 'sepia' })}
        >
          <Text style={[styles.themeBtnText, { color: '#433422' }]}>Aa</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  sliderRow: {
    marginBottom: 24,
  },
  sliderIconText: {
    textAlign: 'center',
  },
  themeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 16,
  },
  themeBtn: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  themeBtnActive: {
    borderWidth: 2,
  },
  themeBtnText: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'serif', // A nice serif for 'Aa' aesthetics
  },
});
