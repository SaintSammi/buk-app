import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useKeepAwake } from 'expo-keep-awake';
import {
  BukReadiumView,
  buildCommand,
  extractEpubToc,
  type EpubTocItem,
  type BukReadyEvent,
  type BukLocationEvent,
  type BukTapEvent,
  type BukErrorEvent,
} from '@/modules/buk-readium';
import { ReaderLayout } from '@/components/reader-ui/reader-layout';
import { useReaderPrefs, prefsToReadium } from '@/hooks/use-reader-prefs';
import { READER_THEMES } from '@/constants/reader-theme';

// ─── Persistence keys ────────────────────────────────────────────────────────

function locatorKey(bookId: string) { return `readium-locator:${bookId}`; }
function progressKey(bookId: string) { return `progress-pct:${bookId}`; }
function bookmarksKey(bookId: string) { return `readium-bookmarks:${bookId}`; }
function statsKey(bookId: string) { return `book-stats:${bookId}`; }

export default function EpubReaderScreen() {
  const router = useRouter();
  const { bookId, title, fileUri } = useLocalSearchParams<{
    bookId?: string;
    title?: string;
    fileUri?: string;
  }>();

  const resolvedBookId = bookId ? String(bookId) : '';
  const resolvedTitle = title ? String(title) : 'EPUB Reader';
  const resolvedUri = fileUri ? String(fileUri) : '';

  // ─── State ─────────────────────────────────────────────────────────────────

  const { prefs, updatePrefs, isLoaded: prefsLoaded } = useReaderPrefs();

  const [controlsVisible, setControlsVisible] = useState(false);
  const [savedLocator, setSavedLocator] = useState<string | null>(null);
  const [positionLoaded, setPositionLoaded] = useState(false);
  const [positionCount, setPositionCount] = useState(0);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [progression, setProgression] = useState(0);
  const [chapterTitle, setChapterTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState('');
  
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [toc, setToc] = useState<EpubTocItem[]>([]);
  
  useKeepAwake();

  // ─── Load locator in parallel ────────────────────────────────────

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!resolvedBookId) {
      setPositionLoaded(true);
      return;
    }
    AsyncStorage.getItem(locatorKey(resolvedBookId))
      .then((loc) => {
        setSavedLocator(loc);
        setPositionLoaded(true);
      })
      .catch(() => setPositionLoaded(true));

    AsyncStorage.getItem(bookmarksKey(resolvedBookId))
      .then((val) => {
        if (val) {
          try { setBookmarks(JSON.parse(val)); } catch {}
        }
      });

    if (resolvedUri) {
      extractEpubToc(resolvedUri).then((res) => {
        if (res) setToc(res);
      });
    }
  }, [resolvedBookId, resolvedUri]);

  useEffect(() => {
    const sessionStart = Date.now();
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (resolvedBookId) {
        const elapsed = Date.now() - sessionStart;
        if (elapsed > 2000) {
          AsyncStorage.getItem(statsKey(resolvedBookId)).then(val => {
             let ms = elapsed;
             if (val) {
                try { ms += JSON.parse(val).sessionAccumulatedMs || 0 } catch {}
             }
             AsyncStorage.setItem(statsKey(resolvedBookId), JSON.stringify({ sessionAccumulatedMs: ms })).catch(()=>{});
          });
        }
      }
    };
  }, [resolvedBookId]);

  // ─── Event handlers ──────────────────────────────────────────────────────

  const handleReady = useCallback((event: BukReadyEvent) => {
    setPositionCount(event.nativeEvent.positionCount);
  }, []);

  const handleLocation = useCallback((event: BukLocationEvent) => {
    const { locator, position, positionCount: total, progression: prog } = event.nativeEvent;
    setCurrentPosition(position);
    setProgression(prog);
    if (total > 0) setPositionCount(total);

    try {
      const parsed = JSON.parse(locator);
      if (parsed?.title) setChapterTitle(String(parsed.title));
    } catch { }

    if (!resolvedBookId || !locator) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      AsyncStorage.setItem(locatorKey(resolvedBookId), locator).catch(() => { });
      AsyncStorage.setItem(progressKey(resolvedBookId), String(prog)).catch(() => { });
    }, 500);
  }, [resolvedBookId]);

  const handleTap = useCallback((_event: BukTapEvent) => {
    setControlsVisible((v) => !v);
  }, []);

  const handleError = useCallback((event: BukErrorEvent) => {
    setError(event.nativeEvent.message);
  }, []);

  const handleAddBookmark = useCallback((locator: string) => {
    setBookmarks(prev => {
      if (prev.includes(locator)) return prev;
      const next = [locator, ...prev];
      AsyncStorage.setItem(bookmarksKey(resolvedBookId), JSON.stringify(next));
      return next;
    });
  }, [resolvedBookId]);

  const handleGoto = useCallback((locator: string) => {
    setCommand(buildCommand('goto', locator));
    setControlsVisible(false);
  }, []);

  // ─── Derived ─────────────────────────────────────────────────────────────
  const isLoading = !positionLoaded || !prefsLoaded || !resolvedUri;
  const theme = READER_THEMES[prefs.themeId];
  const readiumPrefs = JSON.stringify(prefsToReadium(prefs));

  // ─── Error screen ─────────────────────────────────────────────────────────

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={{ color: theme.label, marginTop: 16 }}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ReaderLayout
      prefs={prefs}
      updatePrefs={updatePrefs}
      title={resolvedTitle}
      progressPercent={progression}
      position={currentPosition}
      positionCount={positionCount}
      controlsVisible={controlsVisible}
      currentLocator={savedLocator}
      bookmarks={bookmarks}
      toc={toc}
      onAddBookmark={handleAddBookmark}
      onGoto={handleGoto}
      onSeek={(val) => setCommand(buildCommand('goto', JSON.stringify({ locations: { progression: val } })))}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Reader ───────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <View style={[StyleSheet.absoluteFillObject, styles.centered]}>
          <ActivityIndicator color={theme.label} size="large" />
        </View>
      ) : (
        <BukReadiumView
          style={StyleSheet.absoluteFillObject}
          src={resolvedUri}
          initialLocator={savedLocator ?? undefined}
          preferences={readiumPrefs}
          command={command}
          onBukReady={handleReady}
          onBukLocation={handleLocation}
          onBukTap={handleTap}
          onBukError={handleError}
        />
      )}
    </ReaderLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
  backButton: {
    padding: 8,
  },
});
