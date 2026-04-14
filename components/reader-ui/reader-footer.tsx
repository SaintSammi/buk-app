import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { READER_THEMES } from '@/constants/reader-theme';
import type { ReaderPrefs } from '@/hooks/use-reader-prefs';

interface ReaderFooterProps {
  prefs: ReaderPrefs;
  title: string;
  chapterTitle?: string;
  progressPercent: number; // 0.0 to 1.0
  paginationText?: string;
}

export function ReaderFooter({
  prefs,
  title,
  chapterTitle,
  progressPercent,
  paginationText,
}: ReaderFooterProps) {
  const insets = useSafeAreaInsets();
  const theme = READER_THEMES[prefs.themeId];

  return (
    <View
      style={[
        styles.footer,
        {
          paddingBottom: Math.max(insets.bottom, 10),
          backgroundColor: theme.controlsBg,
          borderTopColor: theme.border,
        },
      ]}
    >
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${(progressPercent * 100).toFixed(2)}%` as `${number}%`, backgroundColor: theme.accent },
          ]}
        />
      </View>

      <View style={styles.footerRow}>
        <Text style={[styles.footerChapter, { color: theme.label }]} numberOfLines={1}>
          {chapterTitle || title}
        </Text>
        {!!paginationText && (
          <Text style={[styles.footerPagination, { color: theme.label }]}>
            {paginationText}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  progressTrack: {
    height: 3,
    width: '100%',
  },
  progressFill: {
    height: 3,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  footerChapter: {
    flex: 1,
    fontSize: 12,
    marginRight: 12,
  },
  footerPagination: {
    fontSize: 12,
  },
});
