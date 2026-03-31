/* eslint-disable @typescript-eslint/no-require-imports */
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View, Pressable, Text, PanResponder, GestureResponderEvent } from 'react-native';
import { WebView } from 'react-native-webview';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// Lazy load AsyncStorage to avoid errors in Expo Go
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
  const AsyncStorage = getAsyncStorage();
  const progressKey = resolvedBookId && AsyncStorage ? `pdf-progress:${resolvedBookId}` : '';
  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [totalPages, setTotalPages] = React.useState<number>(0);
  const [isProgressReady, setIsProgressReady] = React.useState<boolean>(!progressKey);
  const [controlsVisible, setControlsVisible] = React.useState(true);
  const [displayPage, setDisplayPage] = React.useState<number>(1);
  const hideControlsTimeout = React.useRef<NodeJS.Timeout | null>(null);
  const totalPagesRef = React.useRef<number>(0);
  const swipeStartX = React.useRef(0);

  const Pdf = React.useMemo(() => {
    try {
      return require('react-native-pdf').default ?? require('react-native-pdf');
    } catch {
      return null;
    }
  }, []);

  const handleSwipe = React.useCallback((isRightSwipe: boolean) => {
    console.log('[PdfReaderNative] handleSwipe called:', { isRightSwipe, currentPage, totalPages, progressKey });
    setCurrentPage((prev) => {
      let newPage = prev;
      if (isRightSwipe && prev > 1) {
        newPage = prev - 1;
        console.log('[PdfReaderNative] Swipe right to left - going backward:', newPage);
      } else if (!isRightSwipe && prev < totalPages) {
        newPage = prev + 1;
        console.log('[PdfReaderNative] Swipe left to right - going forward:', newPage);
      } else if (!isRightSwipe) {
        console.log('[PdfReaderNative] Swipe blocked - forward check failed:', { prev, totalPages, check: `${prev} < ${totalPages}` });
      }
      if (progressKey && AsyncStorage && newPage !== prev) {
        AsyncStorage.setItem(progressKey, String(newPage)).catch(() => {});
      }
      return newPage;
    });
  }, [totalPages, progressKey]);

  const handleTapMemo = React.useCallback(() => {
    setControlsVisible((prev) => !prev);
  }, []);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderRelease: (evt: GestureResponderEvent, gestureState: any) => {
          const swipeThreshold = 50;
          const swipeDistance = gestureState.dx;
          const swipeYDistance = Math.abs(gestureState.dy);

          console.log('[PdfReaderNative] Pan detected:', { swipeDistance, swipeYDistance });

          // If vertical movement is greater than horizontal, ignore it
          if (swipeYDistance > Math.abs(swipeDistance)) {
            return;
          }

          // If swipe distance is very small, it's a tap
          if (Math.abs(swipeDistance) < 20) {
            console.log('[PdfReaderNative] Tap detected');
            handleTapMemo();
            return;
          }

          // If swipe distance exceeds threshold, it's a page navigation
          if (Math.abs(swipeDistance) > swipeThreshold) {
            console.log('[PdfReaderNative] Page swipe detected');
            handleSwipe(swipeDistance > 0); // Right swipe if positive
          }
        },
      }),
    [handleSwipe, handleTapMemo]
  );

  React.useEffect(() => {
    let cancelled = false;

    async function loadProgress() {
      if (!progressKey || !AsyncStorage) {
        setCurrentPage(1);
        setIsProgressReady(true);
        return;
      }

      try {
        const saved = await AsyncStorage.getItem(progressKey);
        const parsed = saved ? Number.parseInt(saved, 10) : 1;
        if (!cancelled) {
          setCurrentPage(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
        }
      } catch {
        // Fallback if AsyncStorage fails
        if (!cancelled) setCurrentPage(1);
      } finally {
        if (!cancelled) setIsProgressReady(true);
      }
    }

    loadProgress();

    return () => {
      cancelled = true;
    };
  }, [progressKey]);

  // Once PDF is loaded and we know total pages, sync displayPage to currentPage
  React.useEffect(() => {
    if (totalPages > 0) {
      const pageToDisplay = Math.min(Math.max(1, currentPage), totalPages);
      console.log('[PdfReaderNative] Syncing displayPage to:', pageToDisplay, 'totalPages:', totalPages);
      setDisplayPage(pageToDisplay);
    }
  }, [totalPages, currentPage]);

  const handleTap = () => {
    setControlsVisible(!controlsVisible);
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
    }
  };

  if (!resolvedFileUri) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#6D6D6D" />
      </View>
    );
  }

  if (!isProgressReady) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#6D6D6D" />
      </View>
    );
  }

  if (Pdf) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        
        {/* Header */}
        {controlsVisible && (
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Feather name="chevron-left" size={24} color="#FFF" />
            </Pressable>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title ? String(title) : 'PDF Reader'}
            </Text>
            <View style={styles.headerSpacer} />
          </View>
        )}

        {/* PDF Content */}
        <View style={styles.pdfWrapper} {...panResponder.panHandlers}>
          <Pdf
            key={resolvedFileUri}
            source={{ uri: resolvedFileUri, cache: true }}
            style={styles.pdf}
            page={displayPage}
            scale={1}
            horizontal={true}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            scrollEnabled={false}
            singlePage={false}
            onLoadComplete={(numberOfPages: number) => {
              console.log('[PdfReaderNative] onLoadComplete called with:', numberOfPages, 'current cached:', totalPagesRef.current);
              // Only update if we haven't set a valid page count yet, or if this is a significant change
              if (totalPagesRef.current === 0 || numberOfPages > totalPagesRef.current) {
                totalPagesRef.current = numberOfPages;
                console.log('[PdfReaderNative] Setting totalPages to:', numberOfPages);
                setTotalPages(numberOfPages);
              }
            }}
            renderActivityIndicator={() => <ActivityIndicator size="small" color="#6D6D6D" />}
          />
        </View>

        {/* Footer */}
        {controlsVisible && (
          <View style={styles.footer}>
            <Text style={styles.pageIndicator}>
              Page {currentPage} {totalPages > 0 ? `of ${totalPages}` : ''}
            </Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // Expo Go fallback (if native pdf can't load).
  const safeUri = encodeURI(resolvedFileUri).replace(/"/g, '&quot;');
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          html, body { margin: 0; padding: 0; height: 100%; background: #000; }
          embed { width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        <embed src="${safeUri}" type="application/pdf" />
      </body>
    </html>
  `;

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      {controlsVisible && (
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={24} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title ? String(title) : 'PDF Reader'}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
      )}

      {/* WebView Content */}
      <Pressable style={styles.pdfWrapper} onPress={handleTap}>
        <WebView
          originWhitelist={['*']}
          source={{ html }}
          style={styles.pdf}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowFileAccessFromFileURLs
          mixedContentMode="always"
          scrollEnabled
        />
      </Pressable>

      {/* Footer */}
      {controlsVisible && (
        <View style={styles.footer}>
          <Text style={styles.pageIndicator}>PDF Reader</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
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
  pdfWrapper: {
    flex: 1,
  },
  pdf: {
    flex: 1,
    backgroundColor: '#000',
  },
  footer: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  pageIndicator: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
  },
});

