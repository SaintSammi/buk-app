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
  const theme = READER_THEMES[prefs.themeId];

  return (
    <View style={styles.panel}>
      {/* Settings inputs */}

      {/* Font Size Slider */}
      <View style={styles.sliderRow}>
        <ReaderSlider
          value={prefs.fontSize}
          min={0.8}
          max={2.0}
          steps={5}
          height={32}
          hideThumb={true}
          onChange={(val) => updatePrefs({ fontSize: val })}
          activeColor={theme.accent}
          inactiveColor={theme.border}
          dotColor={theme.panelBg}
          activeIconColor={theme.pillActiveFg}
          inactiveIconColor={theme.icon}
          leftIcon={<Text style={[styles.sliderIconText, { fontSize: 13, fontWeight: '700' }]}>A</Text>}
          rightIcon={<Text style={[styles.sliderIconText, { fontSize: 18, fontWeight: '700' }]}>A</Text>}
        />
      </View>

      {/* Brightness Slider */}
      <View style={styles.sliderRow}>
        <ReaderSlider
          value={prefs.brightness}
          min={0.0}
          max={1.0}
          steps={5}
          height={32}
          hideThumb={true}
          onChange={(val) => updatePrefs({ brightness: val })}
          activeColor={theme.accent}
          inactiveColor={theme.border}
          dotColor={theme.panelBg}
          activeIconColor={theme.pillActiveFg}
          inactiveIconColor={theme.icon}
          leftIcon={<Feather name="sun" size={14} />}
          rightIcon={<Feather name="sun" size={18} />}
        />
      </View>

      {/* Theme Selectors */}
      <View style={styles.themeRow}>
        {/* Day Theme */}
        <Pressable
          style={[
            styles.themeBtn,
            { backgroundColor: '#FFFFFF', borderColor: '#E5E5E5', borderWidth: 1 },
            prefs.themeId === 'day' && styles.themeBtnActive,
          ]}
          onPress={() => updatePrefs({ themeId: 'day' })}
        >
          <Text style={[styles.themeBtnText, { color: '#121212' }]}>Aa</Text>
        </Pressable>

        {/* Night Theme */}
        <Pressable
          style={[
            styles.themeBtn,
            { backgroundColor: '#2B2B2B', borderColor: '#2B2B2B', borderWidth: 1 },
            prefs.themeId === 'night' && { borderColor: '#E5E5E5', borderWidth: 2 },
          ]}
          onPress={() => updatePrefs({ themeId: 'night' })}
        >
          <Text style={[styles.themeBtnText, { color: '#FFFFFF' }]}>Aa</Text>
        </Pressable>

        {/* Sepia Theme */}
        <Pressable
          style={[
            styles.themeBtn,
            { backgroundColor: '#FAD8B7', borderColor: '#FAD8B7', borderWidth: 1 },
            prefs.themeId === 'sepia' && styles.themeBtnActive,
          ]}
          onPress={() => updatePrefs({ themeId: 'sepia' })}
        >
          <Text style={[styles.themeBtnText, { color: '#4A3B29' }]}>Aa</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    paddingTop: 24,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 32,
  },
  sliderRow: {},
  sliderIconText: {
    textAlign: 'center',
  },
  themeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  themeBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  themeBtnActive: {
    borderWidth: 3,
    borderColor: '#121212',
  },
  themeBtnText: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'serif', // A nice serif for 'Aa' aesthetics
  },
});
