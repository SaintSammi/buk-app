type BuildWebPdfViewerHtmlParams = {
  resolvedFileUri: string;
  base64: string | null;
  base64State: string;
  pdfJsCode: string | null;
};

export function buildWebPdfViewerHtml({
  resolvedFileUri,
  base64,
  base64State,
  pdfJsCode,
}: BuildWebPdfViewerHtmlParams): string {
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

            })();
          </script>
        </body>
      </html>
    `;
}
