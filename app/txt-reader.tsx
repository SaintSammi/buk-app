import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { ReaderLayout } from '@/components/reader-ui/reader-layout';
import { useReaderPrefs } from '@/hooks/use-reader-prefs';
import { READER_THEMES } from '@/constants/reader-theme';

function txtProgressKey(bookId: string) {
  return `txt-progress:${bookId}`;
}

export default function TxtReaderScreen() {
  const router = useRouter();
  const { bookId, title, fileUri } = useLocalSearchParams<{
    bookId?: string;
    title?: string;
    fileUri?: string;
  }>();

  const resolvedBookId = bookId ? String(bookId) : '';
  const resolvedFileUri = fileUri ? String(fileUri) : '';
  const resolvedTitle = title ? String(title) : 'Text Reader';

  const { prefs, updatePrefs, isLoaded: prefsLoaded } = useReaderPrefs();

  const [content, setContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);

  // Scroll offset state for progress tracking
  const [currentScrollY, setCurrentScrollY] = useState(0);
  const [contentHeight, setContentHeight] = useState(1);
  const scrollViewHeightRef = useRef(1);

  const scrollViewRef = useRef<ScrollView>(null);
  const savedScrollOffset = useRef<number>(0);
  const contentSizeReady = useRef(false);

  // Load file content and saved scroll position
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!resolvedFileUri) {
        setLoadError('No file path provided.');
        return;
      }
      try {
        const text = await FileSystem.readAsStringAsync(resolvedFileUri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        if (!cancelled) setContent(text);
      } catch {
        if (!cancelled) setLoadError('Could not read this file. It may have been moved or deleted.');
      }

      if (!resolvedBookId) return;
      try {
        const saved = await AsyncStorage.getItem(txtProgressKey(resolvedBookId));
        if (!cancelled && saved) {
          savedScrollOffset.current = Number(saved);
        }
      } catch {
        // scroll position loss is non-fatal
      }
    }

    load();
    return () => { cancelled = true; };
  }, [resolvedFileUri, resolvedBookId]);

  // Restore scroll position once content is laid out
  const handleContentSizeChange = useCallback((w: number, h: number) => {
    setContentHeight(h);
    if (contentSizeReady.current) return;
    contentSizeReady.current = true;
    if (savedScrollOffset.current > 0) {
      scrollViewRef.current?.scrollTo({ y: savedScrollOffset.current, animated: false });
    }
  }, []);

  // Persist scroll offset while scrolling (throttled via scrollEventThrottle)
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = e.nativeEvent.contentOffset.y;
      setCurrentScrollY(offset);
      
      if (!resolvedBookId) return;
      AsyncStorage.setItem(txtProgressKey(resolvedBookId), String(offset)).catch(() => {});
    },
    [resolvedBookId]
  );

  const theme = prefsLoaded ? READER_THEMES[prefs.themeId] : null;

  if (!prefsLoaded || !theme) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#6D6D6D" />
      </View>
    );
  }

  // Calculate approximate reading progress based on scroll
  const maxScroll = Math.max(1, contentHeight - scrollViewHeightRef.current);
  const progressPercent = Math.min(1, Math.max(0, currentScrollY / maxScroll));
  const percentText = `${Math.round(progressPercent * 100)}%`;

  return (
    <ReaderLayout
      prefs={prefs}
      updatePrefs={updatePrefs}
      title={resolvedTitle}
      progressPercent={progressPercent}
      paginationText={percentText}
      controlsVisible={controlsVisible}
      onCloseSettings={() => setControlsVisible(true)}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Content */}
      {content === null && loadError === null ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={theme.label} />
        </View>
      ) : loadError !== null ? (
        <View style={styles.errorOverlay}>
          <Text style={[styles.errorText, { color: theme.label }]}>{loadError}</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          onLayout={(e) => scrollViewHeightRef.current = e.nativeEvent.layout.height}
          onContentSizeChange={handleContentSizeChange}
          onScroll={handleScroll}
          scrollEventThrottle={200}
          showsVerticalScrollIndicator={false}
        >
          {/* Toggle controls on tap on text */}
          <Text 
            style={[
              styles.bodyText, 
              { 
                color: theme.text,
                fontSize: 17 * prefs.fontSize,
                lineHeight: 28 * prefs.lineHeight * (prefs.fontSize > 1 ? prefs.fontSize * 0.9 : 1),
                fontFamily: prefs.fontFamily === 'serif' ? 'serif' : 'Inter_400Regular'
              }
            ]} 
            selectable
            onPress={() => setControlsVisible(v => !v)}
          >
            {content}
          </Text>
        </ScrollView>
      )}
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
  loadingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 44, // Extra padding so text doesn't hide behind controls completely
  },
  bodyText: {
    letterSpacing: 0.1,
  },
});
