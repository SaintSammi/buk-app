import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { consumePendingNavigation } from '@/services/pending-navigation';
import { useKeepAwake } from 'expo-keep-awake';
import { useFocusEffect } from '@react-navigation/native';
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

export type BookmarkEntry = { locator: string; savedAt: number };

/** Stable ID for bookmark comparison — href + position, ignores JSON serialisation differences */
function stableLocatorId(locatorJson: string): string {
  try {
    const { href, locations } = JSON.parse(locatorJson);
    return `${href}::${locations?.position ?? locations?.progression ?? ''}`;
  } catch {
    return locatorJson;
  }
}

export default function EpubReaderScreen() {
  const router = useRouter();
  const { bookId, title, author, fileUri } = useLocalSearchParams<{
    bookId?: string;
    title?: string;
    author?: string;
    fileUri?: string;
  }>();

  const resolvedBookId = bookId ? String(bookId) : '';
  const resolvedTitle = title ? String(title) : 'EPUB Reader';
  const resolvedAuthor = author ? String(author) : '';
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
  
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [toc, setToc] = useState<EpubTocItem[]>([]);
  const [currentLocator, setCurrentLocator] = useState<string | null>(null);
  
  useKeepAwake();

  // ─── Load locator in parallel ────────────────────────────────────

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Always holds the most-recent locator string so we can flush it without closing over stale state. */
  const currentLocatorRef = useRef<string | null>(null);

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
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              // Migrate old plain-string format
              if (parsed.length > 0 && typeof parsed[0] === 'string') {
                setBookmarks(parsed.map((s: string) => ({ locator: s, savedAt: 0 })));
              } else {
                setBookmarks(parsed as BookmarkEntry[]);
              }
            }
          } catch {}
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

  // ─── Pending goto (from bookmarks/chapters screens) ─────────────────────

  useFocusEffect(useCallback(() => {
    if (!resolvedBookId) return;
    // Re-sync bookmarks from AsyncStorage every time the reader regains focus.
    // This picks up removals made on the bookmarks screen (which writes to
    // AsyncStorage but can't update the reader's state directly).
    AsyncStorage.getItem(bookmarksKey(resolvedBookId)).then((val) => {
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) setBookmarks(parsed as BookmarkEntry[]);
        } catch {}
      } else {
        setBookmarks([]);
      }
    }).catch(() => {});

    // Read synchronously from in-memory store (no I/O) so React re-renders and
    // delivers the native command within ~16ms, well before the Kotlin restore
    // timer (300ms). This eliminates the timing race between chapter navigation
    // and the onResume position restore.
    const val = consumePendingNavigation(resolvedBookId);
    if (!val) return;
    // Update currentLocator NOW so initialLocator prop is already the target
    // locator by the time the native view (which fully detaches/recreates on
    // every stack navigation) calls mountEpubNavigator. The book then opens
    // directly at the chapter/bookmark page via initialLocator — no go() needed.
    // The go() command below is sent as a fallback for cases where the view
    // does NOT recreate (e.g. if detachPreviousScreen ever works as intended).
    setCurrentLocator(val);
    // The native view always fully recreates when returning from chapters/bookmarks
    // (confirmed by logcat — scope cancel + reattach every time). initialLocator is
    // therefore always sufficient; sending a gotoPosition command is not only
    // unnecessary but harmful: pendingCommand fires on the first onLocationChanged
    // AFTER initialLocator has already correctly opened the chapter, navigating away.
    // Just show the chapter's own position optimistically while Readium reloads.
    try {
      const pos = JSON.parse(val)?.locations?.position;
      if (typeof pos === 'number' && pos > 0) setCurrentPosition(pos);
    } catch {}
  }, [resolvedBookId, positionCount]));

  // ─── Event handlers ──────────────────────────────────────────────────────

  const handleReady = useCallback((event: BukReadyEvent) => {
    setPositionCount(event.nativeEvent.positionCount);
  }, []);

  const handleLocation = useCallback((event: BukLocationEvent) => {
    const { locator, position, positionCount: total, progression: prog } = event.nativeEvent;

    if (position > 0) setCurrentPosition(position);
    setProgression(prog);
    setCurrentLocator(locator);
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
    // Keep a ref of the locator so we can flush it instantly before leaving.
    currentLocatorRef.current = locator;
  }, [resolvedBookId]);

  const handleTap = useCallback((_event: BukTapEvent) => {
    setControlsVisible((v) => !v);
  }, []);

  const handleError = useCallback((event: BukErrorEvent) => {
    setError(event.nativeEvent.message);
  }, []);

  const handleAddBookmark = useCallback((locator: string) => {
    const id = stableLocatorId(locator);
    setBookmarks(prev => {
      const next = prev.some(b => stableLocatorId(b.locator) === id)
        ? prev.filter(b => stableLocatorId(b.locator) !== id)
        : [{ locator, savedAt: Date.now() }, ...prev];
      AsyncStorage.setItem(bookmarksKey(resolvedBookId), JSON.stringify(next));
      return next;
    });
  }, [resolvedBookId]);

  /** Flush the latest locator to AsyncStorage right now, cancelling any pending debounce. */
  const flushPosition = useCallback(() => {
    if (!resolvedBookId || !currentLocatorRef.current) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const loc = currentLocatorRef.current;
    AsyncStorage.setItem(locatorKey(resolvedBookId), loc).catch(() => {});
  }, [resolvedBookId]);

  const handleGoto = useCallback((locator: string) => {
    setCommand(buildCommand('goto', locator));
    setControlsVisible(false);
  }, []);

  const handleOpenBookmarks = useCallback(() => {
    flushPosition();
    setControlsVisible(false);
    router.push({
      pathname: '/bookmarks',
      params: {
        bookId: resolvedBookId,
        title: resolvedTitle,
        author: resolvedAuthor,
        toc: JSON.stringify(toc),
        bookmarks: JSON.stringify(bookmarks),
        themeId: prefs.themeId,
      },
    });
  }, [router, resolvedBookId, resolvedTitle, resolvedAuthor, toc, bookmarks, prefs.themeId, flushPosition]);

  const handleOpenChapters = useCallback(() => {
    flushPosition();
    setControlsVisible(false);
    let currentHref = '';
    try {
      if (currentLocator) currentHref = JSON.parse(currentLocator).href ?? '';
    } catch {}
    router.push({
      pathname: '/chapters',
      params: {
        bookId: resolvedBookId,
        title: resolvedTitle,
        author: resolvedAuthor,
        toc: JSON.stringify(toc),
        currentHref,
        themeId: prefs.themeId,
      },
    });
  }, [router, resolvedBookId, resolvedTitle, resolvedAuthor, toc, currentLocator, prefs.themeId, flushPosition]);

  const handleOpenSearch = useCallback(() => {
    flushPosition();
    setControlsVisible(false);
    router.push({
      pathname: '/search',
      params: {
        bookId: resolvedBookId,
        fileUri: resolvedUri,
        themeId: prefs.themeId,
      },
    });
  }, [router, resolvedBookId, resolvedUri, prefs.themeId, flushPosition]);

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
      author={resolvedAuthor}
      progressPercent={progression}
      position={currentPosition}
      positionCount={positionCount}
      controlsVisible={controlsVisible}
      currentLocator={currentLocator ?? savedLocator}
      isBookmarked={(() => {
        const loc = currentLocator ?? savedLocator;
        if (!loc) return false;
        const id = stableLocatorId(loc);
        return bookmarks.some(b => stableLocatorId(b.locator) === id);
      })()}
      toc={toc}
      bookmarkCount={bookmarks.length}
      onAddBookmark={handleAddBookmark}
      onGoto={handleGoto}
      onSeek={(val) => setCommand(buildCommand('gotoProgression', val))}
      onOpenBookmarks={handleOpenBookmarks}
      onOpenChapters={handleOpenChapters}
      onOpenSearch={handleOpenSearch}
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
          initialLocator={currentLocator ?? savedLocator ?? undefined}
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
