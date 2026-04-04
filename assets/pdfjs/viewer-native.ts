type BuildNativePdfViewerHtmlParams = {
  resolvedFileUri: string;
  base64: string | null;
  base64State: string;
  pdfJsCode: string | null;
};

export function buildNativePdfViewerHtml({
  resolvedFileUri,
  base64,
  base64State,
  pdfJsCode,
}: BuildNativePdfViewerHtmlParams): string {
  const safeUri = encodeURI(resolvedFileUri).replace(/"/g, '&quot;');
  const src = base64 ? `data:application/pdf;base64,${base64}` : safeUri;
  const state = base64State;
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
          </script>
        </body>
      </html>
    `;
}
