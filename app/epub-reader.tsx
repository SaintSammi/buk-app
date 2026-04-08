import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BukEpubWebView } from '@/modules/buk-epub-reader';
import type { BukMessageEvent, BukTapEvent } from '@/modules/buk-epub-reader';
import { useEpubTemplate } from '@/hooks/use-epub-template';

const DARK_THEME = {
  body: {
    background: '#222222',
    color: '#ECEDEE',
    'line-height': '1.8',
  },
  a: { color: '#9BA1A6' },
};

function epubProgressKey(bookId: string) {
  return `epub-progress:${bookId}`;
}

function epubProgressPctKey(bookId: string) {
  return `progress-pct:${bookId}`;
}

export default function EpubReaderScreen() {
  const router = useRouter();
  const { bookId, title, fileUri } = useLocalSearchParams<{
    bookId?: string;
    title?: string;
    author?: string;
    fileUri?: string;
  }>();

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const resolvedBookId = bookId ? String(bookId) : '';
  const resolvedFileUri = fileUri ? String(fileUri) : '';

  // ── Template preparation ────────────────────────────────────────────────
  const { templateUri, isReady: templateReady, error: templateError } = useEpubTemplate({
    src: resolvedFileUri,
    theme: DARK_THEME,
    flow: 'paginated',
  });

  // ── Reader state ────────────────────────────────────────────────────────
  const [controlsVisible, setControlsVisible] = useState(true);
  const [savedCfi, setSavedCfi] = useState<string | null>(null);
  const [positionLoaded, setPositionLoaded] = useState(false);
  const [isBookReady, setIsBookReady] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // ── Imperative navigation via evaluateJavascript ─────────────────────────
  // Shape: JSON.stringify({ id: Date.now(), script: '...' })
  // A new id forces the native view to re-execute even for the same script.
  const [injectJS, setInjectJS] = useState('');

  function runScript(script: string) {
    setInjectJS(JSON.stringify({ id: Date.now(), script }));
  }
  function goNext() { runScript('rendition.next()'); }
  function goPrevious() { runScript('rendition.prev()'); }
  function goToLocation(cfi: string) {
    // Escape single-quotes inside the CFI so it embeds safely in a JS string
    const safe = cfi.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    runScript(`rendition.display('${safe}')`);
  }

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load saved CFI on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (!resolvedBookId) {
      setPositionLoaded(true);
      return;
    }
    AsyncStorage.getItem(epubProgressKey(resolvedBookId))
      .then((cfi) => {
        setSavedCfi(cfi);
        setPositionLoaded(true);
      })
      .catch(() => setPositionLoaded(true));
  }, [resolvedBookId]);

  // ── epub.js message handler ─────────────────────────────────────────────
  const savedCfiRef = useRef(savedCfi);
  useEffect(() => { savedCfiRef.current = savedCfi; }, [savedCfi]);

  const handleBukMessage = useCallback((event: BukMessageEvent) => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(event.nativeEvent.message) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = parsed.type as string;

    if (type === 'onLocationsReady') {
      setIsBookReady(true);
      // Navigate to saved position now that locations are indexed
      if (savedCfiRef.current) {
        goToLocation(savedCfiRef.current);
      }
    }

    if (type === 'onLocationChange') {
      const location = parsed.currentLocation as {
        start?: { location?: number; cfi?: string };
      } | undefined;
      const total = (parsed.totalLocations as number) ?? 0;
      const progress = (parsed.progress as number) ?? 0;

      if (location?.start?.location !== undefined) {
        setCurrentPage(location.start.location + 1);
      }
      setTotalPages(total);

      if (!resolvedBookId || !location?.start?.cfi) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        AsyncStorage.setItem(epubProgressKey(resolvedBookId), location.start!.cfi!).catch(() => {});
        // Store as 0–1 fraction (library sends 0–100)
        AsyncStorage.setItem(epubProgressPctKey(resolvedBookId), String(progress / 100)).catch(() => {});
      }, 500);
    }

    if (type === 'meta') {
      const metadata = parsed.metadata as { cover?: string } | undefined;
      if (resolvedBookId && metadata?.cover) {
        AsyncStorage.setItem(`epub-cover:${resolvedBookId}`, metadata.cover).catch(() => {});
      }
    }
  }, [resolvedBookId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tap handler — 3-zone navigation ────────────────────────────────────
  const handleBukTap = useCallback((event: BukTapEvent) => {
    const x = event.nativeEvent.x; // in dp
    if (x < width * 0.28) {
      goPrevious();
    } else if (x > width * 0.72) {
      goNext();
    } else {
      setControlsVisible((v) => !v);
    }
  }, [width]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // ── Derived UI ──────────────────────────────────────────────────────────
  const paginationText = isBookReady && totalPages > 0
    ? `Page ${currentPage} / ${totalPages}`
    : '';

  const isLoading = !positionLoaded || !resolvedFileUri || !templateReady;

  if (templateError) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.errorText}>Failed to load reader: {templateError}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Header ── */}
      {controlsVisible && (
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={24} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title ? String(title) : 'EPUB Reader'}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
      )}

      {/* ── Reader ── */}
      <View style={styles.readerWrapper}>
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#6D6D6D" />
          </View>
        ) : (
          <BukEpubWebView
            style={StyleSheet.absoluteFillObject}
            src={templateUri!}
            injectJS={injectJS}
            onBukMessage={handleBukMessage}
            onBukTap={handleBukTap}
          />
        )}
      </View>

      {/* ── Footer ── */}
      {controlsVisible && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Text style={styles.footerText} numberOfLines={1}>
            {paginationText}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 40,
  },
  readerWrapper: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 16,
    paddingTop: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  footerText: {
    color: '#9BA1A6',
    fontSize: 13,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
