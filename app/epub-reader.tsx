import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  Animated,
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
import { Reader, ReaderProvider, useReader } from '@epubjs-react-native/core';
import { useFileSystem } from '@/hooks/use-epub-file-system';
import type { Location, Section } from '@epubjs-react-native/core';

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

// Inner component — must be a child of ReaderProvider to use useReader
function EpubReaderContent() {
  const router = useRouter();
  const { bookId, title, fileUri } = useLocalSearchParams<{
    bookId?: string;
    title?: string;
    author?: string;
    fileUri?: string;
  }>();

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { goToLocation } = useReader();

  const [controlsVisible, setControlsVisible] = useState(true);
  const [savedCfi, setSavedCfi] = useState<string | null>(null);
  const [positionLoaded, setPositionLoaded] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [readerHeight, setReaderHeight] = useState(0);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const curtainAnim = useRef(new Animated.Value(1)).current;
  const isAnimatingRef = useRef(false);

  const resolvedBookId = bookId ? String(bookId) : '';
  const resolvedFileUri = fileUri ? String(fileUri) : '';

  // Load saved CFI on mount
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

  // onReady fires before locations are generated — nothing to do here
  const handleReady = useCallback(
    (_total: number, _loc: Location, _progress: number) => {},
    []
  );

  // onLocationsReady fires after book.locations.generate() — safe to seek by CFI
  const handleLocationsReady = useCallback(
    (_epubKey: string, _locations: string[]) => {
      setIsReady(true);
      if (savedCfi) {
        goToLocation(savedCfi);
      }
    },
    [savedCfi, goToLocation]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // Persist position on every page turn (debounced)
  const handleLocationChange = useCallback(
    (_total: number, location: Location, currentProgress: number, _section: Section | null) => {
      if (!location?.start?.cfi) return;

      // currentProgress is already 0–100 (library does Math.floor(percent * 100))
      setDisplayProgress(Math.round(currentProgress));
      // absolute index across whole book — not chapter-scoped
      setCurrentPage(location.start.location + 1);
      setTotalPages(_total);

      if (!resolvedBookId) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        AsyncStorage.setItem(epubProgressKey(resolvedBookId), location.start.cfi).catch(() => {});
        AsyncStorage.setItem(epubProgressPctKey(resolvedBookId), String(currentProgress)).catch(() => {});
      }, 500);
    },
    [resolvedBookId]
  );

  const animatePageTurn = useCallback(
    (dir: 'left' | 'right') => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;
      curtainAnim.setValue(dir === 'left' ? 1 : -1);
      Animated.sequence([
        Animated.timing(curtainAnim, {
          toValue: 0,
          duration: 130,
          useNativeDriver: true,
        }),
        Animated.timing(curtainAnim, {
          toValue: dir === 'left' ? -1 : 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        isAnimatingRef.current = false;
      });
    },
    [curtainAnim]
  );

  const paginationText = isReady && totalPages > 0
    ? `${currentPage} of ${totalPages}  •  ${displayProgress}%`
    : isReady ? `${displayProgress}%` : '';

  if (!positionLoaded || !resolvedFileUri) {
    return (
      <View style={[styles.container, styles.loadingOverlay]}>
        <ActivityIndicator color="#6D6D6D" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header — in layout flow, not absolute, so Reader measures remaining height */}
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

      {/* Reader — height from onLayout so it never overlaps header/footer */}
      <View
        style={styles.readerWrapper}
        onLayout={(e) => setReaderHeight(e.nativeEvent.layout.height)}
      >
        {readerHeight > 0 && (
          <Reader
            src={resolvedFileUri}
            width={width}
            height={readerHeight}
            fileSystem={useFileSystem}
            defaultTheme={DARK_THEME}
            flow="paginated"
            onReady={handleReady}
            onLocationsReady={handleLocationsReady}
            onLocationChange={handleLocationChange}
            onSingleTap={() => setControlsVisible((prev) => !prev)}
            onSwipeLeft={() => animatePageTurn('left')}
            onSwipeRight={() => animatePageTurn('right')}
            renderLoadingFileComponent={() => (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator color="#6D6D6D" />
              </View>
            )}
          />
        )}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: '#222222',
              transform: [
                {
                  translateX: curtainAnim.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: [-width, 0, width],
                  }),
                },
              ],
            },
          ]}
        />
      </View>

      {/* Footer — in layout flow */}
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

export default function EpubReaderScreen() {
  return (
    <ReaderProvider>
      <EpubReaderContent />
    </ReaderProvider>
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
  loadingOverlay: {
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
});
