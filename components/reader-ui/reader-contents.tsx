import React, { useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Image } from 'expo-image';
import type { EpubTocItem } from '@/modules/buk-readium';
import type { ReaderPrefs } from '@/hooks/use-reader-prefs';
import { READER_THEMES } from '@/constants/reader-theme';
import { ReaderSlider } from './reader-slider';

const bookmarkBookIcon = require('@/assets/icons/bookmark-book.svg');
const chapterIcon = require('@/assets/icons/chapter.svg');

interface ReaderContentsProps {
  title: string;
  author?: string;
  toc: EpubTocItem[];
  bookmarkCount?: number;
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
  bookmarkCount = 0,
  prefs,
  progressPercent,
  position,
  positionCount,
  onGoto,
  onSeek,
}: ReaderContentsProps) {
  const theme = READER_THEMES[prefs.themeId];
  const chapterCount = toc.length;
  const [dragging, setDragging] = useState<number | null>(null);

  const displayPercent = dragging !== null ? dragging : progressPercent;
  const displayPosition = dragging !== null
    ? Math.max(1, Math.round(dragging * positionCount))
    : position;

  return (
    <View style={styles.panel}>
      
      {/* Header Info */}
      <View style={styles.headerInfo}>
        <Text style={styles.bookTitle} numberOfLines={2}>
          {title}
        </Text>
        {!!author && (
          <Text style={styles.bookAuthor} numberOfLines={1}>
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
          onDragChange={(val) => setDragging(val)}
          onChange={(val) => { setDragging(null); onSeek && onSeek(val); }}
          activeColor={theme.panelText}
          inactiveColor={theme.border}
          hideThumb={false}
          height={4}
        />
        <View style={styles.progressLabels}>
          <Text style={styles.progressText}>
            {Math.round(displayPercent * 100)}%
          </Text>
          <Text style={styles.progressText}>
            {positionCount > 0 ? `${displayPosition} / ${positionCount}` : ''}
          </Text>
        </View>
      </View>

      {/* Bookmarks & Chapter Cards */}
      <View style={styles.cardsFrame}>
        <View style={styles.cardItem}>
          <View style={styles.cardIconContainer}>
            <Image source={bookmarkBookIcon} style={styles.cardIcon} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Bookmarks</Text>
            <Text style={styles.cardSubtitle}>
              {bookmarkCount} {bookmarkCount === 1 ? 'bookmark' : 'bookmarks'}
            </Text>
          </View>
        </View>
        <View style={styles.cardItem}>
          <View style={styles.cardIconContainer}>
            <Image source={chapterIcon} style={styles.cardIcon} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Chapter</Text>
            <Text style={styles.cardSubtitle}>
              {chapterCount} {chapterCount === 1 ? 'Chapter' : 'Chapters'}
            </Text>
          </View>
        </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: 16,
    gap: 32,
  },
  headerInfo: {
    gap: 4,
  },
  bookTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Manrope_700Bold',
    color: '#000',
  },
  bookAuthor: {
    fontSize: 10,
    fontWeight: '500',
    fontFamily: 'Manrope_700Bold',
    color: '#6D6D6D',
  },
  progressSection: {},
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 2,
  },
  progressText: {
    fontSize: 10,
    fontWeight: '400',
    fontFamily: 'Manrope_700Bold',
    color: '#6D6D6D',
  },
  cardsFrame: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
  },
  cardItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardIconContainer: {
    borderRadius: 4,
    backgroundColor: '#F4F4F4',
    padding: 12,
  },
  cardIcon: {
    width: 24,
    height: 24,
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Manrope_700Bold',
    color: '#000',
  },
  cardSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    fontFamily: 'Manrope_700Bold',
    color: '#6D6D6D',
  },
});
