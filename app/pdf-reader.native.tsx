import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { isPdfPageImageExtractorAvailable } from '@/services/pdf-page-image-extractor';
import { usePdfRasterizer } from '@/hooks/use-pdf-rasterizer';
import { usePageSwipe } from '@/hooks/use-page-swipe';
import PageStrip from '@/components/page-strip';
import { ReaderLayout } from '@/components/reader-ui/reader-layout';
import { useReaderPrefs } from '@/hooks/use-reader-prefs';
import { READER_THEMES } from '@/constants/reader-theme';

const getAsyncStorage = () => {
  try {
    return require('@react-native-async-storage/async-storage').default;
  } catch {
    return null;
  }
};

export default function PdfReaderNativeScreen() {
  const router = useRouter();
  const { title, fileUri, bookId } = useLocalSearchParams<{
    bookId?: string;
    title?: string;
    fileUri?: string;
  }>();

  const resolvedFileUri = fileUri ? String(fileUri) : '';
  const resolvedBookId = bookId ? String(bookId) : '';
  const resolvedTitle = title ? String(title) : 'PDF Reader';

  const AsyncStorage = getAsyncStorage();
  const progressKey = resolvedBookId && AsyncStorage ? `pdf-progress:${resolvedBookId}` : '';

  const { prefs, updatePrefs, isLoaded: prefsLoaded } = useReaderPrefs();

  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pageCountReady, setPageCountReady] = useState(false);
  const [activePdfUri, setActivePdfUri] = useState('');
  const [uriReady, setUriReady] = useState(false);

  const screenWidthRef = useRef(360);
  const screenHeightRef = useRef(Dimensions.get('window').height);

  // True only on Android with the native module loaded
  const extractorAvailable = useMemo(() => isPdfPageImageExtractorAvailable(), []);

  const canGoForward = pageCountReady && totalPages > 0 && currentPage < totalPages;
  const canGoBackward = pageCountReady && currentPage > 1;

  const handlePageCommit = useCallback(
    (newPage: number) => {
      setCurrentPage(newPage);
      if (progressKey && AsyncStorage) {
        AsyncStorage.setItem(progressKey, String(newPage)).catch(() => { });
        if (totalPages > 0) {
          const pctKey = progressKey.replace('pdf-progress:', 'progress-pct:');
          AsyncStorage.setItem(pctKey, String(newPage / totalPages)).catch(() => { });
        }
      }
    },
    [progressKey, totalPages, AsyncStorage]
  );

  const { panHandlers, translateX, dragIntent, getPageBase } = usePageSwipe({
    fileUri: resolvedFileUri,
    currentPage,
    totalPages,
    pageCountReady,
    screenWidthRef,
    canGoForward,
    canGoBackward,
    onPageCommit: handlePageCommit,
    onSingleTap: () => setControlsVisible((prev) => !prev),
  });

  const { getPageImage, pageCount: extractorPageCount, isReady: extractorIsReady } = usePdfRasterizer({
    activePdfUri,
    screenWidthRef,
    screenHeightRef,
    currentPage,
    totalPages,
    dragDirection: dragIntent,
  });

  // Use page count from the extractor when available  skips the Pdf metadata phase
  useEffect(() => {
    if (extractorPageCount != null && extractorPageCount > 0 && !pageCountReady) {
      setTotalPages(extractorPageCount);
      setPageCountReady(true);
    }
  }, [extractorPageCount, pageCountReady]);

  // Reset all per-file state when the opened file changes
  useEffect(() => {
    setPageCountReady(false);
    setTotalPages(0);
    setCurrentPage(1);
    setControlsVisible(true);
  }, [resolvedFileUri]);

  // URI resolution  tries decoded and raw candidates to handle escaped paths
  useEffect(() => {
    let cancelled = false;

    async function resolveUri() {
      setUriReady(false);

      if (!resolvedFileUri) {
        if (!cancelled) { setActivePdfUri(''); setUriReady(true); }
        return;
      }

      const decoded = (() => {
        try { return decodeURIComponent(resolvedFileUri); } catch { return resolvedFileUri; }
      })();

      if (resolvedFileUri.startsWith('content://')) {
        if (!cancelled) { setActivePdfUri(resolvedFileUri); setUriReady(true); }
        return;
      }

      const candidates = [decoded, resolvedFileUri].filter((v, i, arr) => v && arr.indexOf(v) === i);
      for (const candidate of candidates) {
        if (!candidate.startsWith('file://')) continue;
        try {
          const info = await FileSystem.getInfoAsync(candidate);
          if ((info as { exists?: boolean })?.exists) {
            if (!cancelled) { setActivePdfUri(candidate); setUriReady(true); }
            return;
          }
        } catch {
          // Try next candidate
        }
      }

      if (!cancelled) { setActivePdfUri(decoded); setUriReady(true); }
    }

    resolveUri();
    return () => { cancelled = true; };
  }, [resolvedFileUri]);

  // Load saved reading progress
  useEffect(() => {
    let cancelled = false;

    async function loadProgress() {
      if (!progressKey || !AsyncStorage) return;
      try {
        const saved = await AsyncStorage.getItem(progressKey);
        const parsed = saved ? Number.parseInt(saved, 10) : 1;
        if (!cancelled) setCurrentPage(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
      } catch {
        if (!cancelled) setCurrentPage(1);
      }
    }

    loadProgress();
    return () => { cancelled = true; };
  }, [progressKey]);

  // Guard: saved progress may exceed actual page count
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) setCurrentPage(1);
  }, [currentPage, totalPages]);

  // Safety timeout  ensures pageCountReady eventually fires even if Pdf fails
  useEffect(() => {
    if (pageCountReady) return;
    const id = setTimeout(() => {
      setPageCountReady(true);
      setTotalPages((prev) => (prev > 0 ? prev : Math.max(1, currentPage)));
    }, 1400);
    return () => clearTimeout(id);
  }, [pageCountReady, currentPage]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0) screenWidthRef.current = width;
    if (height > 0) screenHeightRef.current = height;
  };

  // Lazy-load react-native-pdf to avoid errors in environments where it isn't available
  const Pdf = useMemo(() => {
    try {
      return require('react-native-pdf').default ?? require('react-native-pdf');
    } catch {
      return null;
    }
  }, []);

  const isLoading = !resolvedFileUri || !uriReady || !prefsLoaded;
  const theme = prefsLoaded ? READER_THEMES[prefs.themeId] : null;

  if (isLoading || !theme) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#6D6D6D" />
      </View>
    );
  }

  const progressPercent = totalPages > 0 ? currentPage / totalPages : 0;

  return (
    <ReaderLayout
      prefs={prefs}
      updatePrefs={updatePrefs}
      title={resolvedTitle}
      progressPercent={progressPercent}
      position={currentPage}
      positionCount={totalPages}
      controlsVisible={controlsVisible}
      onSeek={(val) => {
        if (totalPages > 0) {
          handlePageCommit(Math.max(1, Math.min(totalPages, Math.round(val * totalPages))));
        }
      }}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.pdfWrapper} onLayout={handleLayout}>
        {extractorAvailable ? (
          // Extractor path (Android)
          <View style={styles.nativeStack}>
            <View style={[styles.pageBackdrop, { backgroundColor: theme.bg }]} />

            {/* Hidden Pdf: mounted only until page count is known. */}
            {!pageCountReady && Pdf ? (
              <View style={[StyleSheet.absoluteFill, styles.hiddenLayer]}>
                <Pdf
                  key={`meta-${activePdfUri}`}
                  source={{ uri: activePdfUri, cache: false }}
                  style={styles.fill}
                  page={1}
                  singlePage={false}
                  horizontal={false}
                  enablePaging={false}
                  scrollEnabled={false}
                  spacing={0}
                  onLoadComplete={(pages: number) => {
                    if (pages > 0) { setTotalPages(pages); setPageCountReady(true); }
                  }}
                  onError={() => setPageCountReady(true)}
                  renderActivityIndicator={() => null}
                />
              </View>
            ) : null}

            {/* Image strip + gesture overlay  visible once extractor is ready */}
            {extractorIsReady ? (
              <>
                <PageStrip
                  currentPage={currentPage}
                  prevUri={getPageImage(currentPage - 1)}
                  currentUri={getPageImage(currentPage)}
                  nextUri={getPageImage(currentPage + 1)}
                  translateX={translateX}
                  getPageBase={getPageBase}
                />
                <View style={styles.gestureOverlay} {...panHandlers} />
              </>
            ) : (
              <View style={[styles.loadingOverlay, { backgroundColor: theme.bg }]}>
                <ActivityIndicator color={theme.label} />
              </View>
            )}
          </View>
        ) : Pdf ? (
          // Fallback native path
          <>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]} />
            <Pdf
              key={`native-${activePdfUri}-${currentPage}`}
              source={{ uri: activePdfUri, cache: false }}
              style={[styles.fill, { backgroundColor: theme.bg }]}
              page={Math.max(1, currentPage)}
              singlePage={true}
              horizontal={false}
              enablePaging={false}
              scrollEnabled={false}
              spacing={0}
              onLoadComplete={(pages: number) => {
                if (pages > 0) { setTotalPages(pages); setPageCountReady(true); }
              }}
              onError={() => setPageCountReady(true)}
              renderActivityIndicator={() => <ActivityIndicator size="small" color={theme.label} />}
            />
            {/* Overlay gesture for tap to turn pages / toggle controls if needed in fallback */}
            <View style={styles.gestureOverlay} {...panHandlers} />
          </>
        ) : null}
      </View>
    </ReaderLayout>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  pdfWrapper: {
    flex: 1,
  },
  nativeStack: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  pageBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  fill: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  hiddenLayer: {
    opacity: 0,
  },
  gestureOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 20,
    elevation: 20,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
});