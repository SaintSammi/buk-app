import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EpubTocItem } from '@/modules/buk-readium';
import type { ReaderPrefs } from '@/hooks/use-reader-prefs';
import { READER_THEMES } from '@/constants/reader-theme';

interface ReaderContentsProps {
  toc: EpubTocItem[];
  bookmarks: string[];
  prefs: ReaderPrefs;
  onGoto?: (locator: string) => void;
}

export function ReaderContents({ toc, bookmarks, prefs, onGoto }: ReaderContentsProps) {
  const insets = useSafeAreaInsets();
  const theme = READER_THEMES[prefs.themeId];
  const [tab, setTab] = useState<'toc' | 'bookmarks'>('toc');

  return (
    <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 20) }]}>
      <View style={styles.pillRow}>
        <Pressable
          style={[
            styles.pill,
            tab === 'toc'
              ? { backgroundColor: theme.pillActive }
              : { backgroundColor: 'transparent', borderColor: theme.border, borderWidth: 1 }
          ]}
          onPress={() => setTab('toc')}
        >
          <Text style={[styles.pillText, { color: tab === 'toc' ? theme.pillActiveFg : theme.panelText }]}>
            Sections
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.pill,
            tab === 'bookmarks'
              ? { backgroundColor: theme.pillActive }
              : { backgroundColor: 'transparent', borderColor: theme.border, borderWidth: 1 }
          ]}
          onPress={() => setTab('bookmarks')}
        >
          <Text style={[styles.pillText, { color: tab === 'bookmarks' ? theme.pillActiveFg : theme.panelText }]}>
            Bookmarks
          </Text>
        </Pressable>
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {tab === 'toc' ? (
          toc.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.panelSubtext }]}>No table of contents available.</Text>
          ) : (
            toc.map((item, i) => (
              <Pressable
                key={i}
                style={[styles.item, { borderBottomColor: theme.border }]}
                onPress={() => item.locator && onGoto?.(item.locator)}
              >
                <Text style={[styles.itemText, { color: theme.panelText }]} numberOfLines={2}>
                  {item.title || item.href}
                </Text>
              </Pressable>
            ))
          )
        ) : (
          bookmarks.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.panelSubtext }]}>No bookmarks saved yet.</Text>
          ) : (
            bookmarks.map((locStr, i) => {
              let text = 'Bookmark';
              let prog = '';
              try {
                const loc = JSON.parse(locStr);
                if (loc.title) text = loc.title;
                if (loc.locations?.progression) {
                   prog = `${Math.round(loc.locations.progression * 100)}%`;
                }
              } catch {}
              return (
                <Pressable
                  key={i}
                  style={[styles.item, { borderBottomColor: theme.border }]}
                  onPress={() => onGoto?.(locStr)}
                >
                  <Text style={[styles.itemText, { color: theme.panelText }]} numberOfLines={1}>
                    {text}
                  </Text>
                  {!!prog && <Text style={[styles.progText, { color: theme.panelSubtext }]}>{prog}</Text>}
                </Pressable>
              );
            })
          )
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: 20,
    minHeight: 300,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
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
  list: {
    flex: 1,
  },
  item: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    paddingRight: 12,
  },
  progText: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 32,
    fontSize: 14,
  },
});
