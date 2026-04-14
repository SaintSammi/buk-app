import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReaderThemeId, READER_THEMES } from '@/constants/reader-theme';
import type { ReaderPrefs } from '@/hooks/use-reader-prefs';

interface ReaderSettingsProps {
  prefs: ReaderPrefs;
  updatePrefs: (patch: Partial<ReaderPrefs>) => void;
}

export function ReaderSettings({ prefs, updatePrefs }: ReaderSettingsProps) {
  const insets = useSafeAreaInsets();
  const theme = READER_THEMES[prefs.themeId];

  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: theme.panelBg, paddingBottom: Math.max(insets.bottom, 20) },
      ]}
    >
      <View style={[styles.panelHandle, { backgroundColor: theme.border }]} />

      <Text style={[styles.sectionTitle, { color: theme.panelSubtext }]}>APPEARANCE</Text>
      <View style={styles.pillRow}>
        {(['night', 'day', 'sepia'] as ReaderThemeId[]).map((id) => (
          <Pressable
            key={id}
            style={[
              styles.pill,
              prefs.themeId === id
                ? { backgroundColor: theme.pillActive }
                : { backgroundColor: READER_THEMES[id].bg, borderColor: theme.border, borderWidth: 1 },
            ]}
            onPress={() => updatePrefs({ themeId: id })}
          >
            <Text
              style={[
                styles.pillText,
                { color: prefs.themeId === id ? theme.pillActiveFg : READER_THEMES[id].text },
              ]}
            >
              {id === 'night' ? 'Night' : id === 'day' ? 'Day' : 'Sepia'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.panelSubtext }]}>FONT SIZE</Text>
      <View style={styles.stepRow}>
        <Pressable
          style={[styles.stepBtn, { borderColor: theme.border }]}
          onPress={() => updatePrefs({ fontSize: Math.max(0.8, +(prefs.fontSize - 0.1).toFixed(1)) })}
        >
          <Feather name="minus" size={18} color={theme.icon} />
        </Pressable>
        <Text style={[styles.stepValue, { color: theme.panelText }]}>
          {prefs.fontSize.toFixed(1)}×
        </Text>
        <Pressable
          style={[styles.stepBtn, { borderColor: theme.border }]}
          onPress={() => updatePrefs({ fontSize: Math.min(2.0, +(prefs.fontSize + 0.1).toFixed(1)) })}
        >
          <Feather name="plus" size={18} color={theme.icon} />
        </Pressable>
      </View>

      <Text style={[styles.sectionTitle, { color: theme.panelSubtext }]}>FONT</Text>
      <View style={styles.pillRow}>
        {(['normal', 'serif'] as const).map((fam) => (
          <Pressable
            key={fam}
            style={[
              styles.pill,
              prefs.fontFamily === fam
                ? { backgroundColor: theme.pillActive }
                : { backgroundColor: 'transparent', borderColor: theme.border, borderWidth: 1 },
            ]}
            onPress={() => updatePrefs({ fontFamily: fam })}
          >
            <Text
              style={[
                styles.pillText,
                {
                  color: prefs.fontFamily === fam ? theme.pillActiveFg : theme.panelText,
                  fontFamily: fam === 'serif' ? 'serif' : undefined,
                },
              ]}
            >
              {fam === 'serif' ? 'Serif' : 'Default'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.panelSubtext }]}>LINE SPACING</Text>
      <View style={styles.pillRow}>
        {([
          { label: 'Compact', value: 1.4 },
          { label: 'Normal', value: 1.8 },
          { label: 'Relaxed', value: 2.2 },
        ] as const).map(({ label, value }) => (
          <Pressable
            key={label}
            style={[
              styles.pill,
              prefs.lineHeight === value
                ? { backgroundColor: theme.pillActive }
                : { backgroundColor: 'transparent', borderColor: theme.border, borderWidth: 1 },
            ]}
            onPress={() => updatePrefs({ lineHeight: value })}
          >
            <Text
              style={[
                styles.pillText,
                { color: prefs.lineHeight === value ? theme.pillActiveFg : theme.panelText },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  panelHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 22,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.9,
    marginBottom: 10,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 22,
  },
  pill: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepValue: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '500',
  },
});
