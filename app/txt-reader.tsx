import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

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

  const [content, setContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);

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
  const handleContentSizeChange = useCallback(() => {
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
      if (!resolvedBookId) return;
      AsyncStorage.setItem(txtProgressKey(resolvedBookId), String(offset)).catch(() => {});
    },
    [resolvedBookId]
  );

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
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
            {title ? String(title) : 'Text Reader'}
          </Text>
          <View style={styles.headerSpacer} />
        </Pressable>
      ) : (
        <Pressable
          style={styles.controlsRestoreStrip}
          onPress={() => setControlsVisible(true)}
          hitSlop={8}
        />
      )}

      {/* Content */}
      {content === null && loadError === null ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#6D6D6D" />
        </View>
      ) : loadError !== null ? (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{loadError}</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          onContentSizeChange={handleContentSizeChange}
          onScroll={handleScroll}
          scrollEventThrottle={200}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.bodyText} selectable>
            {content}
          </Text>
        </ScrollView>
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
  controlsRestoreStrip: {
    height: 6,
    backgroundColor: 'transparent',
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
    color: '#9BA1A6',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  bodyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 17,
    lineHeight: 28,
    color: '#ECEDEE',
    letterSpacing: 0.1,
  },
});
