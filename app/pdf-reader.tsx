import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';

export default function PdfReaderScreen() {
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

  const html = useMemo(() => {
    const safeUri = encodeURI(resolvedFileUri).replace(/"/g, '&quot;');
    const src = base64 ? `data:application/pdf;base64,${base64}` : safeUri;
    const state = base64State;
    const resolvedUriJs = JSON.stringify(resolvedFileUri);
    const safeUriJs = JSON.stringify(safeUri);
    const base64Js = JSON.stringify(base64 ?? '');

    return `
      <!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            html, body { margin: 0; padding: 0; height: 100%; background: #000; }
            #viewer { width: 100%; }
            canvas { display: block; width: 100%; height: auto; background: #000; margin: 0; }
            #fallback embed { width: 100%; height: 100%; }
            #viewerMsg { color: #888; padding: 16px; font-family: system-ui; }
          </style>
          <script src="https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.min.js"></script>
        </head>
        <body>
          <div id="viewer"></div>
          <div id="fallback" style="display:block">
            <embed src="${src}" type="application/pdf" />
          </div>
          <script>
            (function () {
              const STATE = '${state}';
              const PDF_BASE64 = ${base64Js};
              const FILE_URI = ${resolvedUriJs};
              const FILE_URI_SAFE = ${safeUriJs};
              const container = document.getElementById('viewer');
              const fallback = document.getElementById('fallback');
              try {
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

                const INITIAL_PAGES = 5;

                async function renderFromPdfJs(pdf) {
                  const numPages = pdf.numPages;
                  const fallbackEl = document.getElementById('fallback');

                  container.innerHTML = '';
                  async function renderPage(pageNum) {
                    const page = await pdf.getPage(pageNum);
                    const baseViewport = page.getViewport({ scale: 1 });
                    const scale = Math.max(0.5, window.innerWidth / baseViewport.width);
                    const viewport = page.getViewport({ scale: scale });

                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;

                    const ctx = canvas.getContext('2d');
                    container.appendChild(canvas);
                    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                  }

                  // Render first page immediately so we don't show a blank screen.
                  await renderPage(1);
                  // If the first page rendered, hide the fallback.
                  if (fallbackEl) fallbackEl.style.display = 'none';

                  // Render up to INITIAL_PAGES to keep memory reasonable.
                  const toRender = Math.min(numPages, INITIAL_PAGES);
                  for (let p = 2; p <= toRender; p++) {
                    await renderPage(p);
                  }

                  if (numPages > INITIAL_PAGES) {
                    container.insertAdjacentHTML(
                      'beforeend',
                      '<div id="viewerMsg">Loading more pages...</div>'
                    );
                  }
                }

                async function loadAndRender() {
                  // Preferred: render from base64 if we have it.
                  if (PDF_BASE64) {
                    const raw = atob(PDF_BASE64);
                    const len = raw.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) bytes[i] = raw.charCodeAt(i);
                    const pdf = await pdfjsLib.getDocument({ data: bytes, disableWorker: true }).promise;
                    await renderFromPdfJs(pdf);
                    return;
                  }

                  // Fallback: try loading PDF.js directly from file:// URL.
                const loadingTask = pdfjsLib.getDocument({
                  url: FILE_URI_SAFE,
                  disableWorker: true,
                  // Some WebViews don't support worker loading; worker is disabled anyway.
                });
                  const pdf = await loadingTask.promise;
                  await renderFromPdfJs(pdf);
                }

                loadAndRender().catch(function (err) {
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
    <View style={styles.container}>
      <Stack.Screen options={{ title: title ? String(title) : 'PDF' }} />
      <WebView
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
        scrollEnabled
        onError={(e) => {
          console.log('[PdfReader] WebView error:', e.nativeEvent);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  web: {
    flex: 1,
    backgroundColor: '#000',
  },
});

