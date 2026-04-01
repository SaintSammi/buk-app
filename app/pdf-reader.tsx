import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, Pressable, Text, LayoutChangeEvent } from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
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
  const [pdfJsCode, setPdfJsCode] = useState<string | null>(null);
  const [pdfJsState, setPdfJsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const webViewRef = React.useRef<WebView>(null);
  const [screenWidth, setScreenWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadBundledPdfJs() {
      setPdfJsState('loading');
      try {
        const asset = Asset.fromModule(require('../assets/pdfjs/pdf.min.txt'));
        await asset.downloadAsync();
        const uri = asset.localUri ?? asset.uri;
        if (!uri) throw new Error('Missing local PDF.js asset URI');
        const code = await FileSystem.readAsStringAsync(uri);
        if (!cancelled) {
          setPdfJsCode(code);
          setPdfJsState('ready');
        }
      } catch (err) {
        console.log('[PdfReader] Failed to load bundled PDF.js:', err);
        if (!cancelled) setPdfJsState('error');
      }
    }

    loadBundledPdfJs();

    return () => {
      cancelled = true;
    };
  }, []);
  
  // Drag tracking refs
  const dragStartRef = React.useRef<{ x: number; time: number } | null>(null);
  const dragCurrentRef = React.useRef(0);
  const isDraggingRef = React.useRef(false);
  const dragVelocityRef = React.useRef(0);
  const preloadedPageRef = React.useRef<number | null>(null);

  const handleLayout = (event: LayoutChangeEvent) => {
    setScreenWidth(event.nativeEvent.layout.width);
  };

  const handleDragStart = React.useCallback((x: number) => {
    dragStartRef.current = { x, time: Date.now() };
    isDraggingRef.current = true;
    dragCurrentRef.current = 0;
    preloadedPageRef.current = null;
    console.log('[PdfReader] Drag started');
  }, []);

  const handleDragMove = React.useCallback((moveX: number) => {
    if (!dragStartRef.current || !screenWidth) return;

    const dragDistance = moveX - dragStartRef.current.x;
    const dragPercent = Math.abs(dragDistance) / screenWidth;
    const timeDelta = (Date.now() - dragStartRef.current.time) / 1000;
    
    dragCurrentRef.current = dragDistance;
    dragVelocityRef.current = timeDelta > 0 ? dragDistance / timeDelta : 0;

    // Determine direction and page to preload
    const isDraggingRight = dragDistance > 0;
    const nextPage = isDraggingRight ? currentPage - 1 : currentPage + 1;
    
    // Preload the adjacent page if we haven't already
    if (dragPercent > 0.1 && !preloadedPageRef.current && nextPage >= 1 && nextPage <= totalPages) {
      preloadedPageRef.current = nextPage;
      console.log('[PdfReader] Preloading page:', nextPage);
      webViewRef.current?.postMessage(JSON.stringify({ 
        type: 'PRELOAD_PAGE', 
        page: nextPage 
      }));
    }

    // Send real-time drag data to WebView for preview
    webViewRef.current?.postMessage(JSON.stringify({ 
      type: 'DRAG_PREVIEW', 
      dragDistance,
      screenWidth,
      dragPercent,
      direction: isDraggingRight ? 'backward' : 'forward'
    }));
  }, [currentPage, screenWidth, totalPages]);

  const handleDragEnd = React.useCallback((endX: number) => {
    if (!dragStartRef.current || !screenWidth) {
      isDraggingRef.current = false;
      return;
    }

    const dragDistance = endX - dragStartRef.current.x;
    const dragPercent = Math.abs(dragDistance) / screenWidth;
    const timeDelta = (Date.now() - dragStartRef.current.time) / 1000;
    const velocity = timeDelta > 0 ? dragDistance / timeDelta : 0;
    const absVelocity = Math.abs(velocity);

    // Snap threshold: 20% distance OR velocity > 1000px/s
    const shouldSnap = dragPercent >= 0.2 || absVelocity > 1000;
    
    const isDraggingRight = dragDistance > 0;
    const nextPage = isDraggingRight ? currentPage - 1 : currentPage + 1;

    console.log('[PdfReader] Drag ended:', { dragPercent, absVelocity, shouldSnap, isDraggingRight });

    if (shouldSnap && nextPage >= 1 && nextPage <= totalPages) {
      // Commit to page change
      setCurrentPage(nextPage);
      webViewRef.current?.postMessage(JSON.stringify({ 
        type: 'SNAP_PAGE', 
        page: nextPage,
        direction: isDraggingRight ? 'backward' : 'forward'
      }));
    } else {
      // Cancel drag, snap back
      webViewRef.current?.postMessage(JSON.stringify({ 
        type: 'CANCEL_DRAG'
      }));
    }

    isDraggingRef.current = false;
    dragStartRef.current = null;
    dragCurrentRef.current = 0;
    preloadedPageRef.current = null;
  }, [currentPage, screenWidth, totalPages]);

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
        console.log('[PdfReader] Going to page:', currentPage);
        webViewRef.current.postMessage(JSON.stringify({ 
          type: 'SET_CURRENT_PAGE', 
          page: currentPage
        }));
      }
    }, 10);
    
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
              max-width: 100%;
              max-height: 100%;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
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
            let PENDING_PAGE = null;  // Page currently being rendered
            let pdfInstance = null;
            let pageCache = {};       // Only stores current ±1 pages
            let lastSwipeDirection = null;
            let renderQueue = [];     // { pageNum, timestamp }
            let renderTimestamps = {}; // Track render order for deduplication
            
            // Drag preview state
            let behindPageCanvas = null;
            let isDragActive = false;
            let dragPhaseCanvas = null;
            
            // ===== DRAG HANDLING (Pointer Events) =====
            let dragStartX = null;
            let dragStartTime = null;
            let dragCurrentX = null;
            let dragPreloadedPage = null;
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
            
            // ===== PHASE 1: RENDER PIPELINE =====
            
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
                
                // RENDER COMPLETELY before returning
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
              
              // Keep only current ±1 in cache
              const pagesToKeep = [CURRENT_PAGE - 1, CURRENT_PAGE, CURRENT_PAGE + 1];
              
              // Remove old pages outside ±1
              Object.keys(pageCache).forEach(p => {
                const pageNumInt = parseInt(p);
                if (!pagesToKeep.includes(pageNumInt)) {
                  delete pageCache[p];
                  console.log('[PDF.js] cache pruning: Removed page', p);
                }
              });
              
              // Cache the new page
              pageCache[pageNum] = canvas.cloneNode(true);
              console.log('[PDF.js] cacheCanvas: Page', pageNum, 'cached. Cache size:', Object.keys(pageCache).length);
            }
            
            function displayPage(canvas, pageNum) {
              const container = document.getElementById('viewer');
              if (!container || !canvas) return;
              
              const existingCanvas = container.querySelector('canvas');
              
              // Prepare new canvas
              const newCanvas = canvas.cloneNode(true);
              newCanvas.style.transition = 'none';
              newCanvas.style.transform = 'translateX(0)';
              newCanvas.style.opacity = '1';
              
              // Remove old canvas
              if (existingCanvas) {
                existingCanvas.style.transition = 'none';
                if (existingCanvas.parentNode) {
                  existingCanvas.parentNode.removeChild(existingCanvas);
                }
              }
              
              // Display new canvas
              container.innerHTML = '';
              container.appendChild(newCanvas);
              console.log('[PDF.js] displayPage: Page', pageNum, 'displayed');
            }
            
            async function renderPage(pageNum) {
              if (!pdfInstance) {
                console.log('[PDF.js] renderPage: No pdfInstance');
                return;
              }
              
              // Bounds validation
              if (pageNum < 1 || pageNum > pdfInstance.numPages) {
                console.log('[PDF.js] renderPage: Invalid page', pageNum);
                pageNum = Math.min(Math.max(1, pageNum), pdfInstance.numPages);
              }
              
              // If already cached, display immediately
              if (pageCache[pageNum]) {
                console.log('[PDF.js] renderPage: Page', pageNum, 'in cache, displaying');
                displayPage(pageCache[pageNum], pageNum);
                return;
              }
              
              // If page is pending render, wait for it
              if (PENDING_PAGE === pageNum) {
                console.log('[PDF.js] renderPage: Page', pageNum, 'already pending');
                return;
              }
              
              // Mark page as pending
              PENDING_PAGE = pageNum;
              console.log('[PDF.js] renderPage: Starting render for page', pageNum);
              
              // STAGE 1: Render offscreen
              const canvas = await renderOffscreen(pageNum);
              
              // STAGE 2: Cache
              if (canvas) {
                cacheCanvas(pageNum, canvas);
              }
              
              // STAGE 3: Display
              if (canvas && PENDING_PAGE === pageNum) {
                displayPage(canvas, pageNum);
              }
              
              PENDING_PAGE = null;
              
              // PHASE 2: After displaying, preload adjacent pages
              preloadAdjacentPages(pageNum);
            }
            
            // ===== PHASE 2: SMART PRELOADING =====
            
            async function preloadAdjacentPages(currentPageNum) {
              const pagesToPreload = [];
              
              // Preload previous page
              if (currentPageNum > 1 && !pageCache[currentPageNum - 1]) {
                pagesToPreload.push(currentPageNum - 1);
              }
              
              // Preload next page
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
            
            // ===== DRAG PREVIEW & SNAPPING =====
            
            async function showDragPreview(dragDistance, screenWidth, dragPercent, direction) {
              const container = document.getElementById('viewer');
              if (!container) return;
              
              const isMovingRight = dragDistance > 0;
              const currentCanvas = container.querySelector('canvas');
              
              // Behind page starts at 85% scale and scales up as dragged
              const behindScale = 0.85 + (0.15 * dragPercent);
              const behindOpacity = Math.min(dragPercent, 1);
              
              // If behind page not rendered yet, create placeholder
              if (!behindPageCanvas) {
                console.log('[PDF.js] Creating behind-page placeholder');
                const placeholder = document.createElement('canvas');
                placeholder.width = 1;
                placeholder.height = 1;
                behindPageCanvas = placeholder;
              }
              
              // Position and scale current page based on drag
              if (currentCanvas) {
                currentCanvas.style.transform = \`translateX(\${dragDistance}px)\`;
                currentCanvas.style.opacity = String(1 - (dragPercent * 0.1)); // Slight fade
              }
              
              // Show behind-page preview with scaling
              if (behindPageCanvas) {
                const canvas = behindPageCanvas.cloneNode(true);
                canvas.style.position = 'absolute';
                canvas.style.transform = \`scale(\${behindScale})\`;
                canvas.style.opacity = String(behindOpacity);
                canvas.style.transformOrigin = isMovingRight ? 'left center' : 'right center';
                canvas.style.pointerEvents = 'none';
                // Behind page positioned behind current
                canvas.style.zIndex = '-1';
              }
            }
            
            async function snapDecision(page, direction) {
              const container = document.getElementById('viewer');
              if (!container) return;
              
              CURRENT_PAGE = page;
              lastSwipeDirection = direction;
              isDragActive = false;
              
              // Clear drag visual state
              const canvas = container.querySelector('canvas');
              if (canvas) {
                canvas.style.transform = 'translateX(0)';
                canvas.style.opacity = '1';
              }
              
              // Render the snapped page
              await renderPage(page);
            }
            
            function cancelDrag() {
              const container = document.getElementById('viewer');
              if (!container) return;
              
              isDragActive = false;
              const canvas = container.querySelector('canvas');
              
              // Snap back to original position with smooth animation
              if (canvas) {
                canvas.style.transition = 'transform 300ms ease-out, opacity 300ms ease-out';
                canvas.style.transform = 'translateX(0)';
                canvas.style.opacity = '1';
                
                setTimeout(() => {
                  canvas.style.transition = 'none';
                }, 300);
              }
              
              console.log('[PDF.js] Drag cancelled, snapped back');
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
                else if (data.type === 'PRELOAD_PAGE') {
                  const pageNum = data.page;
                  if (pageNum >= 1 && pageNum <= pdfInstance.numPages && !pageCache[pageNum]) {
                    preloadPageInBackground(pageNum);
                  }
                }
                else if (data.type === 'DRAG_PREVIEW') {
                  isDragActive = true;
                  showDragPreview(data.dragDistance, data.screenWidth, data.dragPercent, data.direction);
                }
                else if (data.type === 'SNAP_PAGE') {
                  snapDecision(data.page, data.direction);
                }
                else if (data.type === 'CANCEL_DRAG') {
                  cancelDrag();
                }
              } catch (err) {
                console.log('[PDF.js] Message handler error:', err);
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

                let isReady = false;

            async function renderFromPdfJs(pdf) {
              // CLEAR OLD STATE when new PDF loads
              pageCache = {};
              CURRENT_PAGE = 1;
              PENDING_PAGE = null;
              lastSwipeDirection = null;
              
              const numPages = pdf.numPages;
              pdfInstance = pdf;
              const fallbackEl = document.getElementById('fallback');
              const container = document.getElementById('viewer');

              // Send total pages to React
              console.log('[PDF.js] renderFromPdfJs: Total pages detected:', numPages);
              window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'SET_TOTAL_PAGES', totalPages: numPages }));

              // Use the new rendering pipeline for first page
              await renderPage(1);

              if (fallbackEl) fallbackEl.style.display = 'none';
              isReady = true;
              
              console.log('[PDF.js] renderFromPdfJs: Complete');
            }

            async function loadAndRender() {
              console.log('[PDF.js] loadAndRender started');
              try {
                const loaded = await ensurePdfJsLoaded();
                if (!loaded) {
                  container.innerHTML = '<div id="viewerMsg">PDF.js failed to load (offline bundle).</div>';
                  return;
                }

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

                console.log('[PDF.js] Loading from file URL:', FILE_URI_SAFE);
                const loadingTask = pdfjsLib.getDocument({
                  url: FILE_URI_SAFE,
                  disableWorker: true
                });
                const pdf = await loadingTask.promise;
                await renderFromPdfJs(pdf);
              } catch (err) {
                console.log('[PDF.js] ERROR during loadAndRender:', err);
                container.innerHTML = '<div id="viewerMsg">Failed to render PDF.</div>';
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
                
                // Update canvas position during drag
                const canvas = container.querySelector('canvas');
                if (canvas) {
                  canvas.style.transition = 'none';
                  canvas.style.transform = \`translate(calc(-50% + \${dragDistance}px), -50%)\`;
                  canvas.style.opacity = String(Math.max(0.7, 1 - (dragPercent * 0.2)));
                }
                
                // Preload adjacent page if dragging far enough
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
                
                // Snap decision: 20% distance OR velocity > 1000px/s
                const shouldSnap = dragPercent >= 0.2 || Math.abs(velocity) > 1000;
                
                console.log('[Drag] End - distance:', dragPercent.toFixed(2), 'velocity:', velocity.toFixed(0), 'snap:', shouldSnap);
                
                const canvas = container.querySelector('canvas');
                
                if (shouldSnap && nextPage >= 1 && nextPage <= (pdfInstance?.numPages || 1)) {
                  // Commit to page change
                  CURRENT_PAGE = nextPage;
                  canvas.style.transition = 'none';
                  canvas.style.transform = 'translate(-50%, -50%)';
                  canvas.style.opacity = '1';
                  
                  renderPage(CURRENT_PAGE);
                  console.log('[Drag] Snapped to page:', CURRENT_PAGE);
                } else {
                  // Snap back
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

  if (pdfJsState === 'loading') {
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
      <Pressable
        style={styles.pdfWrapper}
        onLongPress={() => setControlsVisible((prev) => !prev)}
      >
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

