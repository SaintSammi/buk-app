import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, Pressable, Text, PanResponder, GestureResponderEvent } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PdfReaderScreen() {
  const router = useRouter();
  const { title, fileUri } = useLocalSearchParams<{
    title?: string;
    fileUri?: string;
  }>();

  const resolvedFileUri = fileUri ? String(fileUri) : '';
  const scheme = useMemo(() => {
    // file://..., content://..., http(s)://...
    const idx = resolvedFileUri.indexOf(':');
    return idx > 0 ? resolvedFileUri.slice(0, idx) : '';
  }, [resolvedFileUri]);

  // Helps debug URI scheme issues on Expo Go (you can copy from the Metro console).
  console.log('[PdfReader] title:', title ? String(title) : '(none)', 'fileUri:', resolvedFileUri, 'scheme:', scheme);

  const [base64, setBase64] = useState<string | null>(null);
  const [base64State, setBase64State] = useState<'loading' | 'ready' | 'too_large' | 'error'>('loading');
  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const webViewRef = React.useRef<WebView>(null);

  const handleSwipe = React.useCallback((isRightSwipe: boolean) => {
    console.log('[PdfReader] handleSwipe called:', { isRightSwipe, currentPage, totalPages });
    setCurrentPage((prev) => {
      if (isRightSwipe && prev > 1) {
        console.log('[PdfReader] Swipe right to left - going backward:', prev - 1);
        return prev - 1;
      } else if (!isRightSwipe && prev < totalPages) {
        console.log('[PdfReader] Swipe left to right - going forward:', prev + 1);
        return prev + 1;
      } else if (!isRightSwipe) {
        console.log('[PdfReader] Swipe blocked - forward check failed:', { prev, totalPages, check: `${prev} < ${totalPages}` });
      }
      return prev;
    });
  }, [totalPages]);

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

          // If vertical movement is greater than horizontal, ignore it
          if (swipeYDistance > Math.abs(swipeDistance)) {
            return;
          }

          // If swipe distance is very small, it's a tap
          if (Math.abs(swipeDistance) < 20) {
            handleTapMemo();
            return;
          }

          // If swipe distance exceeds threshold, it's a page navigation
          if (Math.abs(swipeDistance) > swipeThreshold) {
            handleSwipe(swipeDistance > 0); // Right swipe if positive
          }
        },
      }),
    [handleSwipe, handleTapMemo]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setBase64(null);
      setBase64State('loading');

      // Expo Go has issues rendering local file:// PDFs reliably.
      // A data: URL often works because WebView doesn't need file access.
      if (!resolvedFileUri.startsWith('file://')) return;

      try {
        const info = (await FileSystem.getInfoAsync(resolvedFileUri)) as
          | { exists?: boolean; size?: number }
          | undefined;
        const size =
          info && info.exists && typeof (info as any).size === 'number' ? (info as any).size : undefined;

        // Keep it lightweight: refuse very large PDFs for base64.
        // You can raise this later if needed.
        const MAX_BYTES = 30 * 1024 * 1024; // 30MB
        if (size && size > MAX_BYTES) {
          if (!cancelled) setBase64State('too_large');
          return;
        }

        const b64 = await FileSystem.readAsStringAsync(resolvedFileUri, { encoding: 'base64' });
        if (!cancelled) {
          setBase64(b64);
          setBase64State('ready');
          console.log('[PdfReader] base64 loaded bytes:', size ?? 'unknown', 'chars:', b64.length);
        }
      } catch {
        if (!cancelled) setBase64State('error');
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [resolvedFileUri]);

  // Debounced page updates to prevent rapid re-renders on swipe
  const pageUpdateTimeoutRef = React.useRef<NodeJS.Timeout | number | null>(null);
  
  useEffect(() => {
    if (pageUpdateTimeoutRef.current) clearTimeout(pageUpdateTimeoutRef.current as NodeJS.Timeout | number);
    
    pageUpdateTimeoutRef.current = setTimeout(() => {
      if (webViewRef.current) {
        console.log('[PdfReader] Sending current page to WebView:', currentPage);
        webViewRef.current.postMessage(JSON.stringify({ type: 'SET_CURRENT_PAGE', page: currentPage }));
      }
    }, 50); // Small delay to batch quick swipes
    
    return () => {
      if (pageUpdateTimeoutRef.current) clearTimeout(pageUpdateTimeoutRef.current as NodeJS.Timeout | number);
    };
  }, [currentPage]);

  const handleTap = () => {
    setControlsVisible(!controlsVisible);
  };

  const html = useMemo(() => {
    const safeUri = encodeURI(resolvedFileUri).replace(/"/g, '&quot;');
    const src = base64 ? `data:application/pdf;base64,${base64}` : safeUri;
    const state = base64State;
    const resolvedUriJs = JSON.stringify(resolvedFileUri);
    const safeUriJs = JSON.stringify(safeUri);
    const base64Js = JSON.stringify(base64 ?? '');
    const currentPageJs = currentPage;

    return `
      <!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            html, body { margin: 0; padding: 0; height: 100%; background: #000; overflow: hidden; }
            #viewer { width: 100%; height: 100%; overflow: hidden; }
            canvas { display: block; width: 100%; height: 100%; background: #000; margin: 0; }
            #fallback embed { width: 100%; height: 100%; }
            #viewerMsg { color: #888; padding: 16px; font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100%; }
          </style>
          <script src="https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.min.js"></script>
        </head>
        <body>
          <div id="viewer"></div>
          <div id="fallback" style="display:block">
            <embed src="${src}" type="application/pdf" />
          </div>
          <script>
            // Global variable to be set by injected JavaScript or default to 1
            let CURRENT_PAGE = 1;
            let pdfInstance = null;
            
            // Function to re-render the current page
            async function reRenderCurrentPage() {
              if (pdfInstance) {
                const container = document.getElementById('viewer');
                const numPages = pdfInstance.numPages;
                try {
                  const page = await pdfInstance.getPage(Math.min(Math.max(1, CURRENT_PAGE), numPages));
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
                  const ctx = canvas.getContext('2d');
                  container.innerHTML = '';
                  container.appendChild(canvas);
                  await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                  console.log('[PDF.js] reRenderCurrentPage: rendered page', CURRENT_PAGE);
                } catch (err) {
                  console.log('[PDF.js] Error re-rendering page:', err);
                }
              }
            }
            
            // Listen for messages from React
            window.addEventListener('message', function(event) {
              try {
                const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                if (data.type === 'SET_CURRENT_PAGE') {
                  CURRENT_PAGE = data.page;
                  console.log('[PDF.js] SET_CURRENT_PAGE message received:', CURRENT_PAGE);
                  reRenderCurrentPage();
                }
              } catch (err) {
                console.log('[PDF.js] Error handling message:', err);
              }
            }, false);
            
            
            (function () {
              const STATE = '${state}';
              const PDF_BASE64 = ${base64Js};
              const FILE_URI = ${resolvedUriJs};
              const FILE_URI_SAFE = ${safeUriJs};
              const container = document.getElementById('viewer');
              const fallback = document.getElementById('fallback');
                if (STATE === 'too_large') {
                  container.innerHTML =
                    '<div id="viewerMsg">PDF is too large to load as base64 in Expo Go. Trying PDF.js from file://...</div>';
                  // Still try direct PDF.js from file:// as a best-effort fallback.
                }

                if (STATE === 'error' && !PDF_BASE64) {
                  container.innerHTML =
                    '<div id="viewerMsg">Failed to load PDF data as base64. Trying PDF.js from file://...</div>';
                } else if (!PDF_BASE64) {
                  container.innerHTML = '<div id="viewerMsg">Loading PDF...</div>';
                    // base64 not available; fall through to direct URL loading below.
                }

                if (typeof pdfjsLib === 'undefined') {
                  container.innerHTML = '<div id="viewerMsg">PDF.js failed to load.</div>';
                  return;
                }

                container.innerHTML = '<div id="viewerMsg">Loading PDF.js...</div>';

                let pdfInstance = null;
                let isReady = false;

                async function renderFromPdfJs(pdf) {
                  const numPages = pdf.numPages;
                  pdfInstance = pdf;
                  const fallbackEl = document.getElementById('fallback');

                  // Send total pages to React
                  console.log('[PDF.js] renderFromPdfJs called - Total pages detected:', numPages);
                  window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'SET_TOTAL_PAGES', totalPages: numPages }));
                  console.log('[PDF.js] postMessage sent to React with totalPages:', numPages);

                  async function renderPage(pageNum) {
                    container.innerHTML = '';
                    try {
                      const page = await pdf.getPage(pageNum);
                      const baseViewport = page.getViewport({ scale: 1 });
                      const screenWidth = window.innerWidth;
                      const screenHeight = window.innerHeight - 100; // Account for header/footer
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

                      const ctx = canvas.getContext('2d');
                      container.appendChild(canvas);
                      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                    } catch (err) {
                      container.innerHTML = '<div id="viewerMsg">Error rendering page.</div>';
                    }
                  }

                  // Render only the current page (default to page 1, will be overridden by React)
                  const pageToRender = Math.min(Math.max(1, CURRENT_PAGE), numPages);
                  await renderPage(pageToRender);
                  if (fallbackEl) fallbackEl.style.display = 'none';
                  isReady = true;
                  console.log('[PDF.js] PDF ready, isReady flag set to true');
                }

                async function loadAndRender() {
                  console.log('[PDF.js] loadAndRender started');\n                  // Preferred: render from base64 if we have it.
                  if (PDF_BASE64) {
                    console.log('[PDF.js] Loading from base64 data');
                    const raw = atob(PDF_BASE64);
                    const len = raw.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) bytes[i] = raw.charCodeAt(i);
                    const pdf = await pdfjsLib.getDocument({ data: bytes, disableWorker: true }).promise;
                    await renderFromPdfJs(pdf);
                    return;
                  }

                  // Fallback: try loading PDF.js directly from file:// URL.
                console.log('[PDF.js] Loading from file URL:', FILE_URI_SAFE);
                const loadingTask = pdfjsLib.getDocument({
                  url: FILE_URI_SAFE,
                  disableWorker: true,
                  // Some WebViews don't support worker loading; worker is disabled anyway.
                });
                  const pdf = await loadingTask.promise;
                  await renderFromPdfJs(pdf);
                }

                loadAndRender().catch(function (err) {
                  console.log('[PDF.js] ERROR during loadAndRender:', err);
                  container.innerHTML = '<div id="viewerMsg">Failed to render PDF.</div>';
                  // eslint-disable-next-line no-console
                  console.log('PDF.js load/render error', err);
                });
              } catch (e) {
                container.innerHTML = '<div id="viewerMsg">Failed to decode PDF.</div>';
              }
            })();
          </script>
        </body>
      </html>
    `;
  }, [resolvedFileUri, base64, base64State]);

  if (!resolvedFileUri) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#6D6D6D" />
      </View>
    );
  }

  const isFileScheme = resolvedFileUri.startsWith('file://');

  if (isFileScheme && base64 === null && base64State === 'loading') {
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
      <View style={styles.pdfWrapper} {...panResponder.panHandlers}>
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
          allowUniversalAccessFromFileURLs={isFileScheme}
          mixedContentMode="always"
          scrollEnabled={false}
          injectedJavaScript={`if (typeof isReady !== 'undefined' && isReady && typeof reRenderCurrentPage === 'function') { CURRENT_PAGE = ${currentPage}; reRenderCurrentPage(); }`}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === 'SET_TOTAL_PAGES') {
                console.log('[PdfReader] SET_TOTAL_PAGES message received:', data.totalPages);
                setTotalPages(data.totalPages);
              }
            } catch (e) {
              console.log('[PdfReader] Error parsing message:', e);
            }
          }}
          onError={(e) => {
            console.log('[PdfReader] WebView error:', e.nativeEvent);
          }}
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

