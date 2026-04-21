import React from 'react';
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import type { EpubTocItem } from '@/modules/buk-readium';

function pendingGotoKey(bookId: string) { return `pending-goto:${bookId}`; }

export default function ChaptersScreen() {
  const router = useRouter();
  const { bookId, title, author, toc: tocParam, currentHref } = useLocalSearchParams<{
    bookId?: string;
    title?: string;
    author?: string;
    toc?: string;
    currentHref?: string;
  }>();

  const resolvedBookId = bookId ? String(bookId) : '';
  const resolvedCurrentHref = currentHref ? String(currentHref).split('#')[0] : '';

  const toc: EpubTocItem[] = React.useMemo(() => {
    try { return tocParam ? JSON.parse(String(tocParam)) : []; } catch { return []; }
  }, [tocParam]);

  const handleItemPress = (item: EpubTocItem) => {
    if (!item.locator) return;
    AsyncStorage.setItem(pendingGotoKey(resolvedBookId), item.locator).then(() => {
      router.back();
    });
  };

  // Compute page start and page count for each chapter
  const chaptersWithPages = React.useMemo(() => {
    return toc.map((item, idx) => {
      let pageStart = 0;
      let pageCount: number | null = null;
      try {
        if (item.locator) {
          const parsed = JSON.parse(item.locator);
          pageStart = parsed?.locations?.position ?? 0;
        }
      } catch {}
      try {
        if (idx < toc.length - 1 && toc[idx + 1].locator) {
          const nextParsed = JSON.parse(toc[idx + 1].locator!);
          const nextPage = nextParsed?.locations?.position ?? 0;
          if (nextPage > 0 && pageStart > 0) pageCount = nextPage - pageStart;
        }
      } catch {}
      return { item, pageStart, pageCount };
    });
  }, [toc]);

  const renderItem = ({ item: row, index }: { item: typeof chaptersWithPages[0]; index: number }) => {
    const { item, pageStart, pageCount } = row;
    const hrefBase = item.href.split('#')[0];
    const isActive = resolvedCurrentHref !== '' && hrefBase === resolvedCurrentHref;

    const pageLabel = pageStart > 0 ? `Page ${pageStart}` : '';
    const pageCountLabel = pageCount !== null ? `${pageCount} pages` : '';
    const subtitle = [pageLabel, pageCountLabel].filter(Boolean).join(' • ');

    return (
      <Pressable
        style={[styles.item, isActive && styles.itemActive]}
        onPress={() => handleItemPress(item)}
        disabled={!item.locator}
      >
        <View style={styles.itemContent}>
          <Text style={[styles.itemTitle, isActive && styles.itemTitleActive]}>
            {item.title}
          </Text>
          {!!subtitle && (
            <Text style={styles.itemSubtitle}>{subtitle}</Text>
          )}
        </View>
        {isActive && (
          <View style={styles.activeIndicator} />
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Chapter</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{title ?? ''}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={chaptersWithPages}
        keyExtractor={(row, idx) => `${row.item.href}-${idx}`}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#121212',
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
    color: '#2A2929',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Inter_400Regular',
    color: '#8C8C8C',
  },
  headerSpacer: {
    width: 48,
  },
  listContent: {
    paddingHorizontal: 20,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  itemActive: {
    // subtle highlight for current chapter
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '400',
    fontFamily: 'Inter_400Regular',
    color: '#2A2929',
    lineHeight: 21,
  },
  itemTitleActive: {
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
  },
  itemSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'Inter_400Regular',
    color: '#8C8C8C',
    lineHeight: 21,
  },
  activeIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#121212',
    marginLeft: 12,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
});
