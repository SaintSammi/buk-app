import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, Pressable, Text, LayoutChangeEvent, Animated, PanResponder } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
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

  const [base64, setBase64] = useState<string | null>(null);
  const [base64State, setBase64State] = useState<'loading' | 'ready' | 'too_large' | 'error'>('loading');
  const [pdfJsCode, setPdfJsCode] = useState<string | null>(null);
  const [pdfJsState, setPdfJsState] = useState<'loading' | 'ready' | 'error'>('ready');
  const [useNativeFallback, setUseNativeFallback] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pageCountReady, setPageCountReady] = useState(false);
  const [screenWidth, setScreenWidth] = useState(360);
  const webViewRef = React.useRef<WebView>(null);
  const pageUpdateTimeoutRef = React.useRef<NodeJS.Timeout | number | null>(null);
  const dragX = React.useRef(new Animated.Value(0)).current;
  const Pdf = useMemo(() => {
    try {
      return require('react-native-pdf').default ?? require('react-native-pdf');
    } catch {
      return null;
    }
  }, []);

  // Load progress from AsyncStorage
  useEffect(() => {
    let cancelled = false;

    async function loadProgress() {
      if (!progressKey || !AsyncStorage) {
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
      }
    }

    loadProgress();

    return () => {
      cancelled = true;
    };
  }, [progressKey]);

  useEffect(() => {
    setPageCountReady(false);
    setTotalPages(0);
    setCurrentPage(1);
    dragX.setValue(0);
  }, [resolvedFileUri, dragX]);

  // Save progress to AsyncStorage whenever currentPage changes
  useEffect(() => {
    if (progressKey && AsyncStorage && currentPage > 0) {
      AsyncStorage.setItem(progressKey, String(currentPage)).catch(() => {});
    }
  }, [currentPage, progressKey]);

  // Load PDF file
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setBase64(null);
      setBase64State('loading');

      if (useNativeFallback) {
        setBase64State('ready');
        return;
      }

      if (!resolvedFileUri.startsWith('file://')) return;

      try {
        const info = (await FileSystem.getInfoAsync(resolvedFileUri)) as
          | { exists?: boolean; size?: number }
          | undefined;
        const size =
          info && info.exists && typeof (info as any).size === 'number' ? (info as any).size : undefined;

        const MAX_BYTES = 50 * 1024 * 1024; // 50MB max
        if (size && size > MAX_BYTES) {
          if (!cancelled) setBase64State('too_large');
          return;
        }

        const b64 = await FileSystem.readAsStringAsync(resolvedFileUri, { encoding: 'base64' });
        if (!cancelled) {
          setBase64(b64);
          setBase64State('ready');
          console.log('[PdfReaderNative] PDF loaded, size:', size ?? 'unknown');
        }
      } catch {
        if (!cancelled) setBase64State('error');
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [resolvedFileUri, useNativeFallback]);

  // Send current page to WebView
  useEffect(() => {
    if (pageUpdateTimeoutRef.current) clearTimeout(pageUpdateTimeoutRef.current as NodeJS.Timeout | number);
    
    pageUpdateTimeoutRef.current = setTimeout(() => {
      if (!useNativeFallback && webViewRef.current) {
        console.log('[PdfReaderNative] Sending page:', currentPage);
        webViewRef.current.postMessage(JSON.stringify({ 
          type: 'SET_CURRENT_PAGE', 
          page: currentPage
        }));
      }
    }, 10);
    
    return () => {
      if (pageUpdateTimeoutRef.current) clearTimeout(pageUpdateTimeoutRef.current as NodeJS.Timeout | number);
    };
  }, [currentPage, useNativeFallback]);

  useEffect(() => {
    if (pdfJsState === 'error') {
      setUseNativeFallback(true);
    }
  }, [pdfJsState]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) setScreenWidth(width);
  };

  const resetDrag = React.useCallback(() => {
    Animated.spring(dragX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 120,
      friction: 12,
    }).start();
  }, [dragX]);

  const commitPageWithAnimatedSnap = React.useCallback((nextPage: number, direction: 1 | -1) => {
    setCurrentPage(nextPage);
    dragX.setValue(-direction * screenWidth * 0.28);
    Animated.timing(dragX, {
      toValue: 0,
      duration: 170,
      useNativeDriver: true,
    }).start();
  }, [dragX, screenWidth]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_evt, g) => Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 2,
        onMoveShouldSetPanResponderCapture: (_evt, g) => Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 2,
        onPanResponderGrant: () => {
          dragX.stopAnimation();
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_evt, g) => {
          const clampedDx = Math.max(-screenWidth * 0.9, Math.min(screenWidth * 0.9, g.dx));
          dragX.setValue(clampedDx);
        },
        onPanResponderRelease: (_evt, g) => {
          if (!pageCountReady) {
            resetDrag();
            return;
          }
          const dx = g.dx;
          const dragPercent = Math.abs(dx) / Math.max(1, screenWidth);
          const velocity = g.vx;
          const shouldSnap = dragPercent >= 0.12 || Math.abs(velocity) >= 0.2;

          if (!shouldSnap || totalPages <= 0) {
            resetDrag();
            return;
          }

          const direction = dx > 0 ? 1 : -1;
          const nextPage = direction > 0 ? currentPage - 1 : currentPage + 1;
          if (nextPage < 1 || (totalPages > 0 && nextPage > totalPages)) {
            resetDrag();
            return;
          }

          commitPageWithAnimatedSnap(nextPage, direction);
        },
        onPanResponderTerminate: () => {
          resetDrag();
        },
      }),
    [dragX, screenWidth, totalPages, currentPage, resetDrag, commitPageWithAnimatedSnap, pageCountReady]
  );

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const currentOpacity = dragX.interpolate({
    inputRange: [-screenWidth, 0, screenWidth],
    outputRange: [0.72, 1, 0.72],
    extrapolate: 'clamp',
  });
  const currentScale = dragX.interpolate({
    inputRange: [-screenWidth, 0, screenWidth],
    outputRange: [0.95, 1, 0.95],
    extrapolate: 'clamp',
  });

  const html = useMemo(() => {
    const safeUri = encodeURI(resolvedFileUri).replace(/"/g, '&quot;');
    const src = base64 ? `data:application/pdf;base64,${base64}` : safeUri;
    const state = base64State;
    const resolvedUriJs = JSON.stringify(resolvedFileUri);
    const safeUriJs = JSON.stringify(safeUri);
    const base64Js = JSON.stringify(base64 ?? '');
    const pdfJsCodeJs = JSON.stringify(pdfJsCode ?? '');

    return `
      <!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            html, body { margin: 0; padding: 0; height: 100%; background: #000; overflow: hidden; }
            #viewer { 
              width: 100%; 
              height: 100%; 
              overflow: hidden; 
              position: relative;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            canvas { 
              display: block; 
              background: #000; 
              margin: 0; 
              position: absolute;
              width: 100%;
              height: 100%;
              top: 0;
              left: 0;
              object-fit: contain;
              touch-action: none;
              user-select: none;
              will-change: transform, opacity;
            }
            #fallback embed { width: 100%; height: 100%; }
            #viewerMsg { 
              color: #888; 
              padding: 16px; 
              font-family: system-ui; 
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100%; 
            }
          </style>
        </head>
        <body>
          <div id="viewer"></div>
          <div id="fallback" style="display:block">
            <embed src="${src}" type="application/pdf" />
          </div>
          <script>
            // ===== GLOBAL STATE =====
            let CURRENT_PAGE = 1;
            let PENDING_PAGE = null;
            let pdfInstance = null;
            let pageCache = {};
            let lastSwipeDirection = null;
            
            // Drag preview state
            let behindPageCanvas = null;
            let isDragActive = false;
            let dragPhaseCanvas = null;
            
            // ===== DRAG HANDLING (Pointer Events) =====
            let dragStartX = null;
            let dragStartTime = null;
            let dragCurrentX = null;
            let dragPreloadedPage = null;
            function notifyLoadFailure(message) {
              const payload = { type: 'PDFJS_FAILED', message };
              window.ReactNativeWebView?.postMessage(JSON.stringify(payload));
            }
            const PDF_JS_MODULE_CODE = ${pdfJsCodeJs};
            let pdfJsReadyPromise = null;

            async function ensurePdfJsLoaded() {
              if (typeof pdfjsLib !== 'undefined') {
                return true;
              }

              if (!PDF_JS_MODULE_CODE) {
                return false;
              }

              if (!pdfJsReadyPromise) {
                pdfJsReadyPromise = (async () => {
                  try {
                    const blob = new Blob([PDF_JS_MODULE_CODE], { type: 'text/javascript' });
                    const blobUrl = URL.createObjectURL(blob);
                    const moduleNs = await import(blobUrl);
                    window.pdfjsLib = moduleNs?.default ? moduleNs.default : moduleNs;
                    if (typeof window.pdfjsLib !== 'undefined') {
                      return true;
                    }
                  } catch (err) {
                    console.log('[PDF.js] Offline module load error:', err);
                  }

                  // Fallback for older Android WebView engines that fail dynamic import.
                  try {
                    const sanitized = PDF_JS_MODULE_CODE.replace(/export\s*\{[\s\S]*\};?\s*$/, '');
                    const run = new Function(sanitized);
                    run();
                    if (typeof window.pdfjsLib === 'undefined' && typeof globalThis.pdfjsLib !== 'undefined') {
                      window.pdfjsLib = globalThis.pdfjsLib;
                    }
                    return typeof window.pdfjsLib !== 'undefined';
                  } catch (fallbackErr) {
                    console.log('[PDF.js] Offline fallback eval error:', fallbackErr);
                    return false;
                  }
                })();
              }

              return pdfJsReadyPromise;
            }
            
            // ===== RENDER PIPELINE FUNCTIONS =====
            
            async function renderOffscreen(pageNum) {
              if (!pdfInstance) {
                console.log('[PDF.js] renderOffscreen: No pdfInstance');
                return null;
              }
              
              try {
                const page = await pdfInstance.getPage(pageNum);
                const baseViewport = page.getViewport({ scale: 1 });
                const screenWidth = window.innerWidth;
                const screenHeight = window.innerHeight - 100;
                const scale = Math.min(
                  screenWidth / baseViewport.width,
                  screenHeight / baseViewport.height
                );
                const viewport = page.getViewport({ scale: scale });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                canvas.style.margin = 'auto';
                canvas.style.display = 'block';
                
                const ctx = canvas.getContext('2d', { alpha: false });
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                
                console.log('[PDF.js] renderOffscreen: Page', pageNum, 'fully rendered');
                return canvas;
              } catch (err) {
                console.log('[PDF.js] renderOffscreen error for page', pageNum, ':', err);
                return null;
              }
            }
            
            function cacheCanvas(pageNum, canvas) {
              if (!canvas) return;
              
              const pagesToKeep = [CURRENT_PAGE - 1, CURRENT_PAGE, CURRENT_PAGE + 1];
              
              Object.keys(pageCache).forEach(p => {
                const pageNumInt = parseInt(p);
                if (!pagesToKeep.includes(pageNumInt)) {
                  delete pageCache[p];
                }
              });
              
              pageCache[pageNum] = canvas.cloneNode(true);
              console.log('[PDF.js] cacheCanvas: Page', pageNum, 'cached');
            }
            
            function displayPage(canvas, pageNum) {
              const container = document.getElementById('viewer');
              if (!container || !canvas) return;
              
              const existingCanvas = container.querySelector('canvas');
              
              const newCanvas = canvas.cloneNode(true);
              newCanvas.style.transition = 'none';
              newCanvas.style.transform = 'translateX(0)';
              newCanvas.style.opacity = '1';
              
              if (existingCanvas) {
                existingCanvas.style.transition = 'none';
                if (existingCanvas.parentNode) {
                  existingCanvas.parentNode.removeChild(existingCanvas);
                }
              }
              
              container.innerHTML = '';
              container.appendChild(newCanvas);
              console.log('[PDF.js] displayPage: Page', pageNum, 'displayed');
            }
            
            async function renderPage(pageNum) {
              if (!pdfInstance) {
                console.log('[PDF.js] renderPage: No pdfInstance');
                return;
              }
              
              if (pageNum < 1 || pageNum > pdfInstance.numPages) {
                console.log('[PDF.js] renderPage: Invalid page', pageNum);
                pageNum = Math.min(Math.max(1, pageNum), pdfInstance.numPages);
              }
              
              if (pageCache[pageNum]) {
                console.log('[PDF.js] renderPage: Page', pageNum, 'in cache');
                displayPage(pageCache[pageNum], pageNum);
                return;
              }
              
              if (PENDING_PAGE === pageNum) {
                console.log('[PDF.js] renderPage: Page', pageNum, 'already pending');
                return;
              }
              
              PENDING_PAGE = pageNum;
              console.log('[PDF.js] renderPage: Starting render for page', pageNum);
              
              const canvas = await renderOffscreen(pageNum);
              
              if (canvas) {
                cacheCanvas(pageNum, canvas);
              }
              
              if (canvas && PENDING_PAGE === pageNum) {
                displayPage(canvas, pageNum);
              }
              
              PENDING_PAGE = null;
              preloadAdjacentPages(pageNum);
            }
            
            async function preloadAdjacentPages(currentPageNum) {
              const pagesToPreload = [];
              
              if (currentPageNum > 1 && !pageCache[currentPageNum - 1]) {
                pagesToPreload.push(currentPageNum - 1);
              }
              
              if (currentPageNum < pdfInstance.numPages && !pageCache[currentPageNum + 1]) {
                pagesToPreload.push(currentPageNum + 1);
              }
              
              for (const pageNum of pagesToPreload) {
                preloadPageInBackground(pageNum);
              }
            }
            
            async function preloadPageInBackground(pageNum) {
              console.log('[PDF.js] preloadPageInBackground: Starting preload for page', pageNum);
              
              try {
                const canvas = await renderOffscreen(pageNum);
                if (canvas && pdfInstance) {
                  cacheCanvas(pageNum, canvas);
                  console.log('[PDF.js] preloadPageInBackground: Preload complete for page', pageNum);
                }
              } catch (err) {
                console.log('[PDF.js] preloadPageInBackground error for page', pageNum, ':', err);
              }
            }
            
            // ===== MESSAGE HANDLER =====
            
            window.addEventListener('message', function(event) {
              try {
                const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                if (data.type === 'SET_CURRENT_PAGE') {
                  CURRENT_PAGE = data.page;
                  console.log('[PDF.js] SET_CURRENT_PAGE:', CURRENT_PAGE);
                  renderPage(CURRENT_PAGE);
                }
              } catch (err) {
                console.log('[PDF.js] Message handler error:', err);
              }
            }, false);
            
            // ===== PDF LOADING =====
            
            async function renderFromPdfJs(pdf) {
              pageCache = {};
              CURRENT_PAGE = 1;
              PENDING_PAGE = null;
              
              const numPages = pdf.numPages;
              pdfInstance = pdf;
              const fallbackEl = document.getElementById('fallback');
              const container = document.getElementById('viewer');

              console.log('[PDF.js] renderFromPdfJs: Total pages detected:', numPages);
              window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'SET_TOTAL_PAGES', totalPages: numPages }));

              await renderPage(1);

              if (fallbackEl) fallbackEl.style.display = 'none';
              console.log('[PDF.js] renderFromPdfJs: Complete');
            }
            
            async function loadAndRender() {
              console.log('[PDF.js] loadAndRender started');
              try {
                const STATE = '${state}';
                const PDF_BASE64 = ${base64Js};
                const FILE_URI_SAFE = ${safeUriJs};
                const container = document.getElementById('viewer');

                const loaded = await ensurePdfJsLoaded();
                if (!loaded) {
                  notifyLoadFailure('offline_bundle_load_failed');
                  container.innerHTML = '<div id="viewerMsg">PDF.js failed to load (offline bundle).</div>';
                  return;
                }
                
                if (typeof pdfjsLib === 'undefined') {
                  notifyLoadFailure('pdfjslib_undefined');
                  container.innerHTML = '<div id="viewerMsg">PDF.js failed to load.</div>';
                  return;
                }

                container.innerHTML = '<div id="viewerMsg">Loading PDF.js...</div>';

                let pdfDoc = null;
                
                if (PDF_BASE64) {
                  console.log('[PDF.js] Loading from base64 data');
                  const raw = atob(PDF_BASE64);
                  const len = raw.length;
                  const bytes = new Uint8Array(len);
                  for (let i = 0; i < len; i++) bytes[i] = raw.charCodeAt(i);
                  pdfDoc = await pdfjsLib.getDocument({ data: bytes, disableWorker: true }).promise;
                } else {
                  console.log('[PDF.js] Loading from file URL:', FILE_URI_SAFE);
                  const loadingTask = pdfjsLib.getDocument({
                    url: FILE_URI_SAFE,
                    disableWorker: true
                  });
                  pdfDoc = await loadingTask.promise;
                }

                await renderFromPdfJs(pdfDoc);
              } catch (err) {
                console.log('[PDF.js] ERROR during loadAndRender:', err);
                notifyLoadFailure('load_and_render_error');
                document.getElementById('viewer').innerHTML = '<div id="viewerMsg">Failed to render PDF.</div>';
              }
            }

            loadAndRender();

            // Setup drag listeners after PDF is ready
            setTimeout(() => {
              const container = document.getElementById('viewer');
              if (!container) return;
              
              console.log('[Drag] Setting up pointer event listeners');
              
              container.addEventListener('pointerdown', (e) => {
                dragStartX = e.clientX;
                dragStartTime = Date.now();
                dragCurrentX = e.clientX;
                dragPreloadedPage = null;
                console.log('[Drag] Start at:', dragStartX);
              });
              
              container.addEventListener('pointermove', (e) => {
                if (dragStartX === null) return;
                
                dragCurrentX = e.clientX;
                const dragDistance = dragCurrentX - dragStartX;
                const screenWidth = window.innerWidth;
                const dragPercent = Math.abs(dragDistance) / screenWidth;
                
                const canvas = container.querySelector('canvas');
                if (canvas) {
                  canvas.style.transition = 'none';
                  canvas.style.transform = \`translate(calc(-50% + \${dragDistance}px), -50%)\`;
                  canvas.style.opacity = String(Math.max(0.7, 1 - (dragPercent * 0.2)));
                }
                
                if (dragPercent > 0.1 && !dragPreloadedPage) {
                  const isDraggingRight = dragDistance > 0;
                  const nextPage = isDraggingRight ? CURRENT_PAGE - 1 : CURRENT_PAGE + 1;
                  
                  if (nextPage >= 1 && nextPage <= (pdfInstance?.numPages || 1)) {
                    dragPreloadedPage = nextPage;
                    preloadPageInBackground(nextPage);
                    console.log('[Drag] Preloading page:', nextPage);
                  }
                }
              });
              
              container.addEventListener('pointerup', (e) => {
                if (dragStartX === null) return;
                
                const dragDistance = dragCurrentX - dragStartX;
                const screenWidth = window.innerWidth;
                const dragPercent = Math.abs(dragDistance) / screenWidth;
                const timeDelta = (Date.now() - dragStartTime) / 1000;
                const velocity = timeDelta > 0 ? dragDistance / timeDelta : 0;
                
                const isDraggingRight = dragDistance > 0;
                const nextPage = isDraggingRight ? CURRENT_PAGE - 1 : CURRENT_PAGE + 1;
                
                const shouldSnap = dragPercent >= 0.2 || Math.abs(velocity) > 1000;
                
                console.log('[Drag] End - distance:', dragPercent.toFixed(2), 'velocity:', velocity.toFixed(0), 'snap:', shouldSnap);
                
                const canvas = container.querySelector('canvas');
                
                if (shouldSnap && nextPage >= 1 && nextPage <= (pdfInstance?.numPages || 1)) {
                  CURRENT_PAGE = nextPage;
                  canvas.style.transition = 'none';
                  canvas.style.transform = 'translate(-50%, -50%)';
                  canvas.style.opacity = '1';
                  
                  renderPage(CURRENT_PAGE);
                  console.log('[Drag] Snapped to page:', CURRENT_PAGE);
                } else {
                  canvas.style.transition = 'transform 300ms ease-out, opacity 300ms ease-out';
                  canvas.style.transform = 'translate(-50%, -50%)';
                  canvas.style.opacity = '1';
                  
                  setTimeout(() => {
                    canvas.style.transition = 'none';
                  }, 300);
                  console.log('[Drag] Cancelled, snapped back');
                }
                
                dragStartX = null;
                dragStartTime = null;
                dragCurrentX = null;
                dragPreloadedPage = null;
              });
            }, 500);
          </script>
        </body>
      </html>
    `;
  }, [resolvedFileUri, base64, base64State, pdfJsCode]);

  if (!resolvedFileUri) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#6D6D6D" />
      </View>
    );
  }

  if (pdfJsState === 'loading' && !useNativeFallback) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#6D6D6D" />
      </View>
    );
  }

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
      <Pressable
        style={styles.pdfWrapper}
        onLayout={handleLayout}
        onLongPress={() => setControlsVisible((prev) => !prev)}
      >
        {useNativeFallback && Pdf ? (
          <View style={styles.nativeStack}>
            <View style={styles.pageBackdrop} />

            {!pageCountReady ? (
              <View style={styles.pageLayer}>
                <Pdf
                  key={`native-metadata-${resolvedFileUri}`}
                  source={{ uri: resolvedFileUri, cache: false }}
                  style={styles.web}
                  page={1}
                  horizontal={false}
                  enablePaging={false}
                  scrollEnabled={false}
                  singlePage={false}
                  spacing={0}
                  onLoadComplete={(pages: number) => {
                    if (pages > 0) {
                      console.log('[PdfReaderNative] total pages:', pages);
                      setTotalPages(pages);
                    }
                    setPageCountReady(true);
                  }}
                  renderActivityIndicator={() => <ActivityIndicator size="small" color="#6D6D6D" />}
                />
              </View>
            ) : (
              <Animated.View
                style={[
                  styles.pageLayer,
                  {
                    opacity: currentOpacity,
                    transform: [{ translateX: dragX }, { scale: currentScale }],
                  },
                ]}
              >
                <Pdf
                  key={`native-current-${resolvedFileUri}-${currentPage}`}
                  source={{ uri: resolvedFileUri, cache: false }}
                  style={styles.web}
                  page={currentPage}
                  horizontal={false}
                  enablePaging={false}
                  scrollEnabled={false}
                  singlePage={true}
                  spacing={0}
                  renderActivityIndicator={() => <ActivityIndicator size="small" color="#6D6D6D" />}
                />
              </Animated.View>
            )}

            <Animated.View style={styles.gestureOverlay} {...panResponder.panHandlers} />
          </View>
        ) : (
          <WebView
            ref={webViewRef}
            key={resolvedFileUri}
            originWhitelist={['*']}
            source={{ html }}
            style={styles.web}
            javaScriptEnabled
            domStorageEnabled
            allowFileAccess
            allowFileAccessFromFileURLs
            mixedContentMode="always"
            scrollEnabled={false}
            onMessage={(event) => {
              try {
                const data = JSON.parse(event.nativeEvent.data);
                if (data.type === 'SET_TOTAL_PAGES') {
                  console.log('[PdfReaderNative] SET_TOTAL_PAGES:', data.totalPages);
                  setTotalPages(data.totalPages);
                }
                if (data.type === 'PDFJS_FAILED') {
                  console.log('[PdfReaderNative] Switching to native fallback:', data.message);
                  setUseNativeFallback(true);
                }
              } catch (e) {
                console.log('[PdfReaderNative] Error parsing message:', e);
              }
            }}
            onError={(e) => {
              console.log('[PdfReaderNative] WebView error:', e.nativeEvent);
              setUseNativeFallback(true);
            }}
          />
        )}
      </Pressable>

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
  web: {
    flex: 1,
    backgroundColor: '#000',
  },
  nativeStack: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  pageLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  pageBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#121212',
  },
  gestureOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 20,
    elevation: 20,
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
