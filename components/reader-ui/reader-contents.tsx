import React from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EpubTocItem } from '@/modules/buk-readium';
import type { ReaderPrefs } from '@/hooks/use-reader-prefs';
import { READER_THEMES } from '@/constants/reader-theme';
import { ReaderSlider } from './reader-slider';

interface ReaderContentsProps {
  title: string;
  author?: string;
  toc: EpubTocItem[];
  prefs: ReaderPrefs;
  progressPercent: number;
  position: number;
  positionCount: number;
  onGoto?: (locator: string) => void;
  onSeek?: (progression: number) => void;
}

export function ReaderContents({
  title,
  author,
  toc,
  prefs,
  progressPercent,
  position,
  positionCount,
  onGoto,
  onSeek,
}: ReaderContentsProps) {
  const insets = useSafeAreaInsets();
  const theme = READER_THEMES[prefs.themeId];

  return (
    <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 24) + 120 }]}>
      
      {/* Header Info */}
      <View style={styles.headerInfo}>
        <Text style={[styles.bookTitle, { color: theme.panelText }]} numberOfLines={2}>
          {title}
        </Text>
        {!!author && (
          <Text style={[styles.bookAuthor, { color: theme.panelSubtext }]} numberOfLines={1}>
            {author}
          </Text>
        )}
      </View>

      {/* Scrubbable Progress Bar */}
      <View style={styles.progressSection}>
        <ReaderSlider
          value={progressPercent}
          min={0.0}
          max={1.0}
          onChange={(val) => onSeek && onSeek(val)}
          activeColor={theme.panelText}
          inactiveColor={theme.border}
          hideThumb={false}
          height={6}
        />
        <View style={styles.progressLabels}>
          <Text style={[styles.progressText, { color: theme.panelSubtext }]}>
            {Math.round(progressPercent * 100)}%
          </Text>
          <Text style={[styles.progressText, { color: theme.panelSubtext }]}>
            {positionCount > 0 ? `${position} / ${positionCount}` : ''}
          </Text>
        </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    paddingTop: 24,
    paddingHorizontal: 24,
    minHeight: 300,
  },
  headerInfo: {
    marginBottom: 24,
  },
  bookTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
    fontFamily: 'sans-serif',
  },
  bookAuthor: {
    fontSize: 16,
    fontWeight: '500',
  },
  progressSection: {
    marginBottom: 32,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
