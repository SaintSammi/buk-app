import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { READER_THEMES } from '@/constants/reader-theme';
import type { ReaderPrefs } from '@/hooks/use-reader-prefs';

interface ReaderHeaderProps {
  title: string;
  prefs: ReaderPrefs;
  currentLocator?: string | null;
  onOpenSettings: () => void;
  onAddBookmark?: (locator: string) => void;
}

export function ReaderHeader({ title, prefs, currentLocator, onOpenSettings, onAddBookmark }: ReaderHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = READER_THEMES[prefs.themeId];

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: Math.max(insets.top, 14),
          backgroundColor: theme.controlsBg,
          borderBottomColor: theme.border,
        },
      ]}
    >
      <Pressable style={styles.iconBtn} onPress={() => router.back()}>
        <Feather name="chevron-left" size={24} color={theme.icon} />
      </Pressable>

      <Text style={[styles.headerTitle, { color: theme.icon }]} numberOfLines={1}>
        {title}
      </Text>

      <View style={styles.rightActions}>
        <Pressable 
          style={styles.iconBtn} 
          onPress={() => {
            if (onAddBookmark && currentLocator) onAddBookmark(currentLocator);
          }}
        >
          <Feather name="bookmark" size={19} color={theme.icon} />
        </Pressable>

        <Pressable style={styles.iconBtn} onPress={onOpenSettings}>
          <Feather name="sliders" size={19} color={theme.icon} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rightActions: {
    flexDirection: 'row',
  },
  iconBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 4,
  },
});
