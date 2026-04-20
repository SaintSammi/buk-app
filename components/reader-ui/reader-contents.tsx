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
          onDragChange={(val) => setDragging(val)}
          onChange={(val) => { setDragging(null); onSeek && onSeek(val); }}
          activeColor={theme.panelText}
          inactiveColor={theme.border}
          activeIconColor={theme.panelBg}
          inactiveIconColor={theme.panelSubtext}
          hideThumb={false}
          height={32}
          leftIcon={
            <Text style={styles.progressLabel}>
              {Math.round(displayPercent * 100)}%
            </Text>
          }
          rightIcon={
            <Text style={styles.progressLabel}>
              {positionCount > 0 ? `${displayPosition} / ${positionCount}` : ''}
            </Text>
          }
        />
      </View>

      {/* Bookmarks & Chapter Cards */}
      <View style={styles.cardsFrame}>
        <View style={styles.cardItem}>
          <View style={[styles.cardIconContainer, { backgroundColor: theme.iconContainerBg }]}>
            <Image source={bookmarkBookIcon} style={styles.cardIcon} />
          </View>
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { color: theme.panelText }]}>Bookmarks</Text>
            <Text style={[styles.cardSubtitle, { color: theme.panelSubtext }]}>
              {bookmarkCount} {bookmarkCount === 1 ? 'bookmark' : 'bookmarks'}
            </Text>
          </View>
        </View>
        <View style={styles.cardItem}>
          <View style={[styles.cardIconContainer, { backgroundColor: theme.iconContainerBg }]}>
            <Image source={chapterIcon} style={styles.cardIcon} />
          </View>
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { color: theme.panelText }]}>Chapter</Text>
            <Text style={[styles.cardSubtitle, { color: theme.panelSubtext }]}>
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
  },
  bookAuthor: {
    fontSize: 10,
    fontWeight: '500',
    fontFamily: 'Manrope_700Bold',
  },
  progressSection: {},
  progressLabel: {
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
    fontWeight: '700',
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
  },
  cardSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    fontFamily: 'Manrope_700Bold',
  },
});
