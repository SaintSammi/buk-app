import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { searchEpub, type EpubSearchResult } from '@/modules/buk-readium';
import { setPendingNavigation } from '@/services/pending-navigation';
import { READER_THEMES } from '@/constants/reader-theme';
import { useReaderPrefs } from '@/hooks/use-reader-prefs';

export default function SearchScreen() {
  const router = useRouter();
  const { bookId, fileUri } = useLocalSearchParams<{
    bookId?: string;
    fileUri?: string;
  }>();

  const { prefs } = useReaderPrefs();
  const theme = READER_THEMES[prefs.themeId] ?? READER_THEMES.day;
  const resolvedBookId = bookId ? String(bookId) : '';
  const resolvedFileUri = fileUri ? String(fileUri) : '';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EpubSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed || !resolvedFileUri) return;
    setIsSearching(true);
    setHasSearched(false);
    try {
      const res = await searchEpub(resolvedFileUri, trimmed);
      setResults(res);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
      setHasSearched(true);
    }
  };

  const handleItemPress = (result: EpubSearchResult) => {
    setPendingNavigation(resolvedBookId, result.locator);
    router.back();
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    inputRef.current?.focus();
  };

  /** Render snippet with the searched query bolded */
  const renderSnippet = (snippet: string, searchQuery: string) => {
    if (!searchQuery.trim() || !snippet) {
      return <Text style={[styles.snippet, { color: theme.panelSubtext }]}>{snippet}</Text>;
    }
    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = snippet.split(regex);
    return (
      <Text style={[styles.snippet, { color: theme.panelSubtext }]}>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <Text key={i} style={[styles.snippetHighlight, { color: theme.text }]}>
              {part}
            </Text>
          ) : (
            <Text key={i}>{part}</Text>
          )
        )}
      </Text>
    );
  };

  const renderItem = ({ item }: { item: EpubSearchResult }) => (
    <Pressable style={styles.item} onPress={() => handleItemPress(item)}>
      <View style={styles.itemContent}>
        {!!item.chapterTitle && (
          <Text style={[styles.chapterLabel, { color: theme.panelSubtext }]} numberOfLines={1}>
            {item.chapterTitle}
          </Text>
        )}
        {renderSnippet(item.snippet, query.trim())}
      </View>
      <Feather name="chevron-right" size={16} color={theme.panelSubtext} />
    </Pressable>
  );

  const showEmpty = hasSearched && !isSearching && results.length === 0;
  const showPrompt = !hasSearched && !isSearching;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.accent }]} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color={theme.bg} />
        </Pressable>

        <View style={[styles.searchBar, { backgroundColor: theme.controlsBg }]}>
          <Feather name="search" size={16} color={theme.panelSubtext} style={styles.searchIcon} />
          <TextInput
            ref={inputRef}
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search in book..."
            placeholderTextColor={theme.panelSubtext}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable onPress={handleClear} hitSlop={8}>
              <Feather name="x" size={16} color={theme.panelSubtext} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Body */}
      {isSearching ? (
        <View style={styles.centeredState}>
          <ActivityIndicator color={theme.text} size="large" />
        </View>
      ) : showPrompt ? (
        <View style={styles.centeredState}>
          <Feather name="search" size={48} color={theme.border} />
          <Text style={[styles.stateText, { color: theme.panelSubtext }]}>Search the book</Text>
        </View>
      ) : showEmpty ? (
        <View style={styles.centeredState}>
          <Feather name="file-text" size={48} color={theme.border} />
          <Text style={[styles.stateText, { color: theme.panelSubtext }]}>
            No results for "{query.trim()}"
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(_, idx) => String(idx)}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: theme.border }]} />}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    paddingHorizontal: 14,
    height: 44,
    gap: 8,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    includeFontPadding: false,
    padding: 0,
  },
  centeredState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  stateText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  itemContent: {
    flex: 1,
    gap: 3,
  },
  chapterLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  snippet: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
  snippetHighlight: {
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
