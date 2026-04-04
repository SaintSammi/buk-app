import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Reader, ReaderProvider, useReader } from '@epubjs-react-native/core';
import { useFileSystem } from '@/hooks/use-epub-file-system';
import type { Location, Section } from '@epubjs-react-native/core';

const DARK_THEME = {
  body: {
    background: '#000000',
    color: '#ECEDEE',
    'line-height': '1.8',
  },
  a: { color: '#9BA1A6' },
};

function epubProgressKey(bookId: string) {
  return `epub-progress:${bookId}`;
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

  const { width, height } = useWindowDimensions();
  const { section, progress, goToLocation } = useReader();

  const [controlsVisible, setControlsVisible] = useState(true);
  const [savedCfi, setSavedCfi] = useState<string | null>(null);
  const [positionLoaded, setPositionLoaded] = useState(false);
  const [readerHeight, setReaderHeight] = useState(height);

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

  // Restore position once the reader is ready
  const handleReady = useCallback(
    (_total: number, _loc: Location, _progress: number) => {
      if (savedCfi) {
        goToLocation(savedCfi);
      }
    },
    [savedCfi, goToLocation]
  );

  // Persist position on every page turn
  const handleLocationChange = useCallback(
    (_total: number, location: Location, _progress: number, _section: Section | null) => {
      if (!resolvedBookId || !location?.start?.cfi) return;
      AsyncStorage.setItem(epubProgressKey(resolvedBookId), location.start.cfi).catch(() => {});
    },
    [resolvedBookId]
  );

  const chapterLabel = section?.label?.trim() ?? '';
  const displayProgress = Math.round((progress ?? 0) * 100);

  if (!positionLoaded) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#6D6D6D" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header — also acts as long-press target to hide controls */}
      {controlsVisible ? (
        <Pressable
          style={styles.header}
          onLongPress={() => setControlsVisible(false)}
          delayLongPress={500}
        >
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={24} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title ? String(title) : 'EPUB Reader'}
          </Text>
          <View style={styles.headerSpacer} />
        </Pressable>
      ) : (
        // Thin restore strip when controls are hidden — doesn't overlap reading content
        <Pressable
          style={styles.controlsRestoreStrip}
          onPress={() => setControlsVisible(true)}
          hitSlop={8}
        />
      )}

      {/* Reader */}
      <View
        style={styles.readerWrapper}
        onLayout={(e) => setReaderHeight(e.nativeEvent.layout.height)}
      >
        <Reader
          src={resolvedFileUri}
          width={width}
          height={readerHeight}
          fileSystem={useFileSystem}
          defaultTheme={DARK_THEME}
          flow="paginated"
          onReady={handleReady}
          onLocationChange={handleLocationChange}
          renderLoadingFileComponent={() => (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color="#6D6D6D" />
            </View>
          )}
        />
      </View>

      {/* Footer */}
      {controlsVisible && (
        <Pressable
          style={styles.footer}
          onLongPress={() => setControlsVisible(false)}
          delayLongPress={500}
        >
          <Text style={styles.footerText} numberOfLines={1}>
            {chapterLabel ? `${chapterLabel}  •  ` : ''}
            {displayProgress}%
          </Text>
        </Pressable>
      )}
    </SafeAreaView>
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
  controlsRestoreStrip: {
    height: 6,
    backgroundColor: 'transparent',
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
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  footerText: {
    color: '#9BA1A6',
    fontSize: 13,
  },
});
