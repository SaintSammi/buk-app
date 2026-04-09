import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BukReadiumView,
  buildCommand,
  type BukReadyEvent,
  type BukLocationEvent,
  type BukTapEvent,
  type BukErrorEvent,
  type BukReadiumPreferences,
} from '@/modules/buk-readium';

// ─── Persistence keys ────────────────────────────────────────────────────────

function locatorKey(bookId: string) { return `readium-locator:${bookId}`; }
function progressKey(bookId: string) { return `progress-pct:${bookId}`; }

// ─── Preferences (dark theme by default) ──────────────────────────────────────

const DEFAULT_PREFERENCES: BukReadiumPreferences = {
  backgroundColor: '#222222',
  textColor:       '#ECEDEE',
  lineHeight:      1.8,
};

export default function ReaderScreen() {
  const router = useRouter();
  const { bookId, title, fileUri } = useLocalSearchParams<{
    bookId?: string;
    title?: string;
    fileUri?: string;
  }>();
  const insets = useSafeAreaInsets();

  const resolvedBookId = bookId  ? String(bookId)  : '';
  const resolvedTitle  = title   ? String(title)    : 'Reader';
  const resolvedUri    = fileUri ? String(fileUri)  : '';

  // ─── State ─────────────────────────────────────────────────────────────────

  const [controlsVisible, setControlsVisible]   = useState(true);
  const [savedLocator,    setSavedLocator]       = useState<string | null>(null);
  const [positionLoaded,  setPositionLoaded]     = useState(false);
  const [positionCount,   setPositionCount]      = useState(0);
  const [currentPosition, setCurrentPosition]   = useState(0);
  const [error,           setError]             = useState<string | null>(null);
  const [command,         setCommand]           = useState('');

  // ─── Persistence ───────────────────────────────────────────────────────────

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!resolvedBookId) { setPositionLoaded(true); return; }
    AsyncStorage.getItem(locatorKey(resolvedBookId))
      .then((loc) => { setSavedLocator(loc); setPositionLoaded(true); })
      .catch(()   =>                          setPositionLoaded(true));
  }, [resolvedBookId]);

  useEffect(() => () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
  }, []);

  // ─── Event handlers ────────────────────────────────────────────────────────

  const handleReady = useCallback((event: BukReadyEvent) => {
    setPositionCount(event.nativeEvent.positionCount);
  }, []);

  const handleLocation = useCallback((event: BukLocationEvent) => {
    const { locator, position, positionCount: total, progression } = event.nativeEvent;
    setCurrentPosition(position);
    if (total > 0) setPositionCount(total);

    if (!resolvedBookId || !locator) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      AsyncStorage.setItem(locatorKey(resolvedBookId), locator).catch(() => {});
      AsyncStorage.setItem(progressKey(resolvedBookId), String(progression)).catch(() => {});
    }, 500);
  }, [resolvedBookId]);

  const handleTap = useCallback((event: BukTapEvent) => {
    // Readium already handles edge taps for page turns.
    // Centre tap (or tap we receive here) toggles controls.
    setControlsVisible((v) => !v);
  }, []);

  const handleError = useCallback((event: BukErrorEvent) => {
    setError(event.nativeEvent.message);
  }, []);

  // ─── Derived UI ────────────────────────────────────────────────────────────

  const isLoading = !positionLoaded || !resolvedUri;

  const paginationText = positionCount > 0
    ? `${currentPosition} / ${positionCount}`
    : '';

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={{ color: '#9BA1A6', marginTop: 16 }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Full-screen reader — no layout flex, always fills entire container */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#6D6D6D" />
        </View>
      ) : (
        <BukReadiumView
          style={StyleSheet.absoluteFillObject}
          src={resolvedUri}
          initialLocator={savedLocator ?? undefined}
          preferences={JSON.stringify(DEFAULT_PREFERENCES)}
          command={command}
          onBukReady={handleReady}
          onBukLocation={handleLocation}
          onBukTap={handleTap}
          onBukError={handleError}
        />
      )}

      {/* Controls — absolute overlays, don't affect BukReadiumView layout */}
      {controlsVisible && (
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
          <Pressable style={styles.headerBack} onPress={() => router.back()}>
            <Feather name="chevron-left" size={24} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {resolvedTitle}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
      )}

      {controlsVisible && positionCount > 0 && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Text style={styles.footerText}>{paginationText}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#222222',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerBack: {
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
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
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
  backButton: {
    padding: 8,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
