import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { EpubTocItem } from '@/modules/buk-readium';
import type { BookmarkEntry } from './epub-reader';
import { setPendingNavigation } from '@/services/pending-navigation';
import { READER_THEMES, type ReaderThemeId } from '@/constants/reader-theme';

const emptyStateIcon = require('@/assets/icons/bookmark empty state icon.svg');
const bookmarkRemoveIcon = require('@/assets/icons/bookmark-remove.svg');

function bookmarksKey(bookId: string) { return `readium-bookmarks:${bookId}`; }

function findChapterForHref(href: string, toc: EpubTocItem[]): { title: string; index: number } {
  const base = href.split('#')[0];
  const idx = toc.findIndex(t => t.href.split('#')[0] === base);
  if (idx !== -1) return { title: toc[idx].title, index: idx };
  // Fallback: partial match
  const partial = toc.findIndex(t => base.includes(t.href.split('#')[0]) || t.href.split('#')[0].includes(base));
  if (partial !== -1) return { title: toc[partial].title, index: partial };
  return { title: 'Unknown Chapter', index: -1 };
}

function formatDate(timestamp: number): string {
  if (timestamp === 0) return '—';
  return new Date(timestamp).toLocaleDateString('en-GB');
}

export default function BookmarksScreen() {
  const router = useRouter();
  const { bookId, title, author, toc: tocParam, bookmarks: bookmarksParam, themeId: themeIdParam } = useLocalSearchParams<{
    bookId?: string;
    title?: string;
    author?: string;
    toc?: string;
    bookmarks?: string;
    themeId?: string;
  }>();

  const resolvedBookId = bookId ? String(bookId) : '';
  const theme = READER_THEMES[(themeIdParam as ReaderThemeId) ?? 'day'] ?? READER_THEMES.day;

  const toc: EpubTocItem[] = React.useMemo(() => {
    try { return tocParam ? JSON.parse(String(tocParam)) : []; } catch { return []; }
  }, [tocParam]);

  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>(() => {
    try { return bookmarksParam ? JSON.parse(String(bookmarksParam)) : []; } catch { return []; }
  });

  const handleItemPress = (locator: string) => {
    // Write to in-memory store synchronously BEFORE router.back() (see pending-navigation.ts).
    setPendingNavigation(resolvedBookId, locator);
    router.back();
  };

  const handleRemove = (entry: BookmarkEntry) => {
    Alert.alert(
      'Remove Bookmark',
      'Remove this bookmark?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setBookmarks(prev => {
              const next = prev.filter(b => b.locator !== entry.locator);
              AsyncStorage.setItem(bookmarksKey(resolvedBookId), JSON.stringify(next));
              return next;
            });
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: BookmarkEntry }) => {
    let chapterTitle = 'Unknown Chapter';
    let chapterIndex = -1;
    let pageNum = '';

    try {
      const parsed = JSON.parse(item.locator);
      const href: string = parsed?.href ?? '';
      const position: number = parsed?.locations?.position ?? 0;
      pageNum = position > 0 ? String(position) : '';
      const found = findChapterForHref(href, toc);
      chapterTitle = found.title;
      chapterIndex = found.index;
    } catch {}

    const chapterLabel = chapterIndex >= 0 ? `Chapter ${chapterIndex + 1}` : chapterTitle;
    const subtitle = pageNum
      ? `${chapterLabel} • Page ${pageNum}`
      : chapterLabel;

    return (
      <Pressable style={styles.item} onPress={() => handleItemPress(item.locator)}>
        <View style={styles.itemContent}>
          <Text style={[styles.itemTitle, { color: theme.text }]}>
            Bookmark on {formatDate(item.savedAt)}
          </Text>
          <Text style={[styles.itemSubtitle, { color: theme.panelSubtext }]}>{subtitle}</Text>
        </View>
        <Pressable
          style={styles.removeBtn}
          hitSlop={12}
          onPress={() => handleRemove(item)}
        >
          <Image source={bookmarkRemoveIcon} style={styles.removeIcon} contentFit="contain" />
        </Pressable>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.accent }]} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color={theme.bg} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Bookmark</Text>
          <Text style={[styles.headerSubtitle, { color: theme.panelSubtext }]} numberOfLines={1}>{title ?? ''}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {bookmarks.length === 0 ? (
        <View style={styles.emptyState}>
          <Image source={emptyStateIcon} style={styles.emptyIcon} contentFit="contain" />
          <Text style={[styles.emptyText, { color: theme.text }]}>No Bookmark Yet</Text>
        </View>
      ) : (
        <FlatList
          data={bookmarks}
          keyExtractor={(item, idx) => `${item.savedAt}-${idx}`}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: theme.border }]} />}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Inter_400Regular',
  },
  headerSpacer: {
    width: 48,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  emptyIcon: {
    width: 80,
    height: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  listContent: {
    paddingHorizontal: 20,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '400',
    fontFamily: 'Inter_400Regular',
    lineHeight: 21,
  },
  itemSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'Inter_400Regular',
    lineHeight: 21,
  },
  removeBtn: {
    padding: 4,
  },
  removeIcon: {
    width: 24,
    height: 24,
  },
  divider: {
    height: 1,
  },
});
