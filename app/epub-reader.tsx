import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
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
import type { BukMessageEvent } from '@/modules/buk-epub-reader';
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

  //  Template preparation 
  const { templateUri, isReady: templateReady, error: templateError } = useEpubTemplate({
    src: resolvedFileUri,
    theme: DARK_THEME,
    flow: 'paginated',
  });

  //  Reader state 
  const [controlsVisible, setControlsVisible] = useState(true);
  const [savedCfi, setSavedCfi] = useState<string | null>(null);
  const [positionLoaded, setPositionLoaded] = useState(false);
  const [isBookReady, setIsBookReady] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  //  Imperative navigation 
  const [mainInjectJS, setMainInjectJS] = useState('');
  const [prevInjectJS, setPrevInjectJS] = useState('');
  const [nextInjectJS, setNextInjectJS] = useState('');
  const screenWidthRef = useRef(Dimensions.get('window').width);

  const prevReadyRef  = useRef(false);
  const nextReadyRef  = useRef(false);
  const currentCfiRef = useRef<string | null>(null);

  function runScript(script: string) {
    setMainInjectJS(JSON.stringify({ id: Date.now(), script }));
  }
  function goNext()     { runScript('rendition.next()'); }
  function goPrevious() { runScript('rendition.prev()'); }
  function goToLocation(cfi: string) {
    const safe = cfi.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    runScript(`rendition.display('${safe}')`);
  }
  function preloadNeighbors(cfi: string) {
    const safe = cfi.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    if (prevReadyRef.current) {
      setPrevInjectJS(JSON.stringify({ id: Date.now(), script: `rendition.display('${safe}').then(()=>rendition.prev())` }));
    }
    if (nextReadyRef.current) {
      setNextInjectJS(JSON.stringify({ id: Date.now(), script: `rendition.display('${safe}').then(()=>rendition.next())` }));
    }
  }

  //  Animation  3-panel strip 
  //
  //  prevPanel  base = -W  dark slab, slides in on right-swipe (go back)
  //  WebView    base =  0  live epub.js content
  //  nextPanel  base = +W  dark slab, slides in on left-swipe  (go forward)
  //
  //  After commit: coverOpacity masks the WebView while epub.js internally
  //  switches pages; fades out when onLocationChange arrives.
  //
  const dragX        = useRef(new Animated.Value(0)).current;
  const coverOpacity = useRef(new Animated.Value(0)).current;

  const prevPanelX = useMemo(
    () => Animated.add(dragX, new Animated.Value(-screenWidthRef.current)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const nextPanelX = useMemo(
    () => Animated.add(dragX, new Animated.Value(screenWidthRef.current)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const isCommittingRef   = useRef(false);
  const dragIntentRef     = useRef<'left' | 'right' | null>(null);
  const touchStartTimeRef = useRef(0);

  const goNextRef     = useRef(goNext);
  const goPrevRef     = useRef(goPrevious);
  const controlsRef   = useRef(setControlsVisible);
  useEffect(() => { goNextRef.current   = goNext; },          [goNext]);      // eslint-disable-line
  useEffect(() => { goPrevRef.current   = goPrevious; },      [goPrevious]);  // eslint-disable-line
  useEffect(() => { controlsRef.current = setControlsVisible; }, []);

  const resetDrag = useCallback(() => {
    dragIntentRef.current = null;
    Animated.spring(dragX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 180,
      friction: 20,
      overshootClamping: true,
    }).start();
  }, [dragX]);

  const commitAndNavigate = useCallback(
    (dir: 'left' | 'right', velocityX: number) => {
      isCommittingRef.current = true;
      dragIntentRef.current   = null;

      const SW    = screenWidthRef.current;
      const exitX = dir === 'left' ? -SW : SW;
      const speed = Math.min(Math.abs(velocityX), 4);
      const dur   = Math.max(80, 220 - speed * 30);

      Animated.timing(dragX, { toValue: exitX, duration: dur, useNativeDriver: true })
        .start(({ finished }) => {
          if (!finished) {
            isCommittingRef.current = false;
            dragX.setValue(0);
            return;
          }
          // Cover the flash, reset strip, fire navigation.
          // isCommittingRef released in onLocationChange handler.
          coverOpacity.setValue(1);
          dragX.setValue(0);
          if (dir === 'left') goNextRef.current();
          else                goPrevRef.current();
        });
    },
    [dragX, coverOpacity],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder:        ()     => !isCommittingRef.current,
        onStartShouldSetPanResponderCapture: ()     => false,
        onMoveShouldSetPanResponder:         (_, g) =>
          !isCommittingRef.current && Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 4,
        onMoveShouldSetPanResponderCapture:  (_, g) =>
          !isCommittingRef.current && Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 4,
        onPanResponderTerminationRequest: () => false,

        onPanResponderGrant: () => {
          if (isCommittingRef.current) return;
          touchStartTimeRef.current = Date.now();
          dragX.stopAnimation();
          dragX.setValue(0);
          dragIntentRef.current = null;
        },

        onPanResponderMove: (_, g) => {
          if (isCommittingRef.current) return;
          const SW = screenWidthRef.current;
          if (g.dx < 0) {
            dragIntentRef.current = 'left';
            dragX.setValue(Math.max(g.dx, -SW * 0.95));
          } else if (g.dx > 0) {
            dragIntentRef.current = 'right';
            dragX.setValue(Math.min(g.dx, SW * 0.95));
          }
        },

        onPanResponderRelease: (_, g) => {
          if (isCommittingRef.current) return;

          const elapsed = Date.now() - touchStartTimeRef.current;
          const isTap   = elapsed < 200 && Math.abs(g.dx) < 10 && Math.abs(g.dy) < 10;

          if (isTap) {
            const sw = screenWidthRef.current;
            if      (g.x0 < sw * 0.28) commitAndNavigate('right', 0);
            else if (g.x0 > sw * 0.72) commitAndNavigate('left', 0);
            else {
              controlsRef.current((v) => !v);
              dragX.setValue(0);
              dragIntentRef.current = null;
            }
            return;
          }

          const dir = dragIntentRef.current;
          if (!dir) { resetDrag(); return; }

          const SW           = screenWidthRef.current;
          const shouldCommit = Math.abs(g.dx) / SW >= 0.25 || Math.abs(g.vx) >= 0.4;
          if (!shouldCommit) { resetDrag(); return; }

          commitAndNavigate(dir, g.vx);
        },

        onPanResponderTerminate: () => {
          dragX.setValue(0);
          dragIntentRef.current   = null;
          isCommittingRef.current = false;
        },
      }),
    [dragX, resetDrag, commitAndNavigate],
  );

  //  Persistence 
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!resolvedBookId) { setPositionLoaded(true); return; }
    AsyncStorage.getItem(epubProgressKey(resolvedBookId))
      .then((cfi) => { setSavedCfi(cfi); setPositionLoaded(true); })
      .catch(()   =>                      setPositionLoaded(true));
  }, [resolvedBookId]);

  useEffect(() => () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
  }, []);

  //  epub.js message handler 
  const savedCfiRef = useRef(savedCfi);
  useEffect(() => { savedCfiRef.current = savedCfi; }, [savedCfi]);

  const handleBukMessage = useCallback(
    (event: BukMessageEvent) => {
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(event.nativeEvent.message) as Record<string, unknown>; }
      catch { return; }

      const type = parsed.type as string;

      if (type === 'onLocationsReady') {
        setIsBookReady(true);
        if (savedCfiRef.current) goToLocation(savedCfiRef.current);
      }

      if (type === 'onLocationChange') {
        const location = parsed.currentLocation as {
          start?: { location?: number; cfi?: string };
        } | undefined;
        const total    = (parsed.totalLocations as number) ?? 0;
        const progress = (parsed.progress      as number) ?? 0;

        if (location?.start?.location !== undefined) {
          setCurrentPage(location.start.location + 1);
        }
        setTotalPages(total);

        const newCfi = location?.start?.cfi;
        if (newCfi) currentCfiRef.current = newCfi;

        // Fade the transition cover away, then unlock + preload neighbors.
        // Neighbors are updated AFTER the cover disappears so the user never
        // sees them rerender mid-swipe.
        Animated.timing(coverOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }).start(() => {
          isCommittingRef.current = false;
          if (newCfi) preloadNeighbors(newCfi);
        });

        if (!resolvedBookId || !location?.start?.cfi) return;
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          AsyncStorage.setItem(epubProgressKey(resolvedBookId), location.start!.cfi!).catch(() => {});
          AsyncStorage.setItem(epubProgressPctKey(resolvedBookId), String(progress / 100)).catch(() => {});
        }, 500);
      }

      if (type === 'meta') {
        const metadata = parsed.metadata as { cover?: string } | undefined;
        if (resolvedBookId && metadata?.cover) {
          AsyncStorage.setItem(`epub-cover:${resolvedBookId}`, metadata.cover).catch(() => {});
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedBookId, coverOpacity],
  );

  // Handles messages from the prev / next preloaded WebViews
  const handlePrevMessage = useCallback(
    (event: BukMessageEvent) => {
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(event.nativeEvent.message) as Record<string, unknown>; }
      catch { return; }
      if ((parsed.type as string) === 'onLocationsReady') {
        prevReadyRef.current = true;
        if (currentCfiRef.current) preloadNeighbors(currentCfiRef.current);
      }
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleNextMessage = useCallback(
    (event: BukMessageEvent) => {
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(event.nativeEvent.message) as Record<string, unknown>; }
      catch { return; }
      if ((parsed.type as string) === 'onLocationsReady') {
        nextReadyRef.current = true;
        if (currentCfiRef.current) preloadNeighbors(currentCfiRef.current);
      }
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  //  Derived UI 
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

      {/* Reader fills the entire container — header/footer are absolute overlays */}
      <View
        style={styles.readerWrapper}
        onLayout={(e) => { screenWidthRef.current = e.nativeEvent.layout.width; }}
      >
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#6D6D6D" />
          </View>
        ) : (
          <>
            {/* Prev-page WebView  preloaded, peeks in on right-swipe */}
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFillObject, { transform: [{ translateX: prevPanelX }] }]}
            >
              <BukEpubWebView
                style={StyleSheet.absoluteFillObject}
                src={templateUri!}
                injectJS={prevInjectJS}
                onBukMessage={handlePrevMessage}
              />
            </Animated.View>

            {/* Next-page WebView  preloaded, peeks in on left-swipe */}
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFillObject, { transform: [{ translateX: nextPanelX }] }]}
            >
              <BukEpubWebView
                style={StyleSheet.absoluteFillObject}
                src={templateUri!}
                injectJS={nextInjectJS}
                onBukMessage={handleNextMessage}
              />
            </Animated.View>

            {/* Current page  rendered last so it sits on top of neighbors */}
            <Animated.View
              style={[StyleSheet.absoluteFillObject, { transform: [{ translateX: dragX }] }]}
            >
              <BukEpubWebView
                style={StyleSheet.absoluteFillObject}
                src={templateUri!}
                injectJS={mainInjectJS}
                onBukMessage={handleBukMessage}
              />
            </Animated.View>

            {/* Transition cover  hides epub.js internal page-switch */}
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFillObject, { backgroundColor: '#222222', opacity: coverOpacity }]}
            />

            {/* Gesture overlay  claims all horizontal swipes + taps */}
            <View style={StyleSheet.absoluteFillObject} {...panResponder.panHandlers} />
          </>
        )}
      </View>

      {/* Absolute overlays — do NOT affect readerWrapper layout */}
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
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
