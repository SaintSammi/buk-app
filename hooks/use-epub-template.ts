import { useState, useEffect } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

// Bundled epub.js + jszip sources from @epubjs-react-native/core
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZIP_SRC: string = (require('@epubjs-react-native/core/lib/commonjs/jszip') as { default: string }).default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EPUBJS_SRC: string = (require('@epubjs-react-native/core/lib/commonjs/epubjs') as { default: string }).default;

type Theme = Record<string, Record<string, string>>;

interface UseEpubTemplateOptions {
  src: string;
  theme: Theme;
  flow: string;
}

interface UseEpubTemplateResult {
  templateUri: string | null;
  isReady: boolean;
  error: string | null;
}

export function useEpubTemplate({
  src,
  theme,
  flow,
}: UseEpubTemplateOptions): UseEpubTemplateResult {
  const [templateUri, setTemplateUri] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // JSON.stringify(theme) in the dep array so we only re-run when values change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const themeKey = JSON.stringify(theme);

  useEffect(() => {
    if (!src) return;

    let cancelled = false;
    setIsReady(false);
    setTemplateUri(null);
    setError(null);

    void (async () => {
      try {
        const docDir = FileSystem.documentDirectory ?? '';

        const jszipUri = `${docDir}jszip.min.js`;
        const epubjsUri = `${docDir}epub.min.js`;

        // Write library files to disk once per install (they don't change)
        const [jszipInfo, epubjsInfo] = await Promise.all([
          FileSystem.getInfoAsync(jszipUri),
          FileSystem.getInfoAsync(epubjsUri),
        ]);

        await Promise.all([
          jszipInfo.exists
            ? Promise.resolve()
            : FileSystem.writeAsStringAsync(jszipUri, JSZIP_SRC),
          epubjsInfo.exists
            ? Promise.resolve()
            : FileSystem.writeAsStringAsync(epubjsUri, EPUBJS_SRC),
        ]);

        const html = buildHtml({ src, theme, flow, jszipUri, epubjsUri });
        const templatePath = `${docDir}epub-template.html`;
        await FileSystem.writeAsStringAsync(templatePath, html);

        if (!cancelled) {
          setTemplateUri(templatePath);
          setIsReady(true);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : 'Failed to prepare epub template',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, flow, themeKey]);

  return { templateUri, isReady, error };
}

// ─── HTML builder ───────────────────────────────────────────────────────────────

function escapeForJs(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildHtml({
  src,
  theme,
  flow,
  jszipUri,
  epubjsUri,
}: {
  src: string;
  theme: Theme;
  flow: string;
  jszipUri: string;
  epubjsUri: string;
}): string {
  const bodyBg = theme.body?.background ?? '#000000';
  const bodyColor = theme.body?.color ?? '#ffffff';
  const themeJson = JSON.stringify(theme);
  const safeSrc = escapeForJs(src);
  const safeFlow = escapeForJs(flow);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="${jszipUri}"></script>
  <script src="${epubjsUri}"></script>
  <style>
    html, body {
      margin: 0; padding: 0;
      background: ${bodyBg};
      color: ${bodyColor};
      width: 100%; height: 100%;
    }
    #viewer {
      width: 100vw; height: 100vh;
      overflow: hidden;
      display: flex;
      justify-content: center;
      align-items: center;
    }
  </style>
</head>
<body>
  <div id="viewer"></div>
  <script>
    var rn = window.ReactNativeWebView || window;
    var book = ePub('${safeSrc}');
    var rendition = book.renderTo('viewer', {
      width: '100%',
      height: '100%',
      flow: '${safeFlow}',
      allowScriptedContent: false
    });

    rendition.on('started', function () {
      rendition.themes.register({ theme: ${themeJson} });
      rendition.themes.select('theme');
    });

    book.ready
      .then(function () {
        return book.locations.generate(1600);
      })
      .then(function () {
        rn.postMessage(JSON.stringify({
          type: 'onLocationsReady',
          totalLocations: book.locations.total,
          currentLocation: rendition.currentLocation()
        }));
      });

    rendition.display().then(function () {
      book.coverUrl()
        .then(function (url) {
          if (!url) return;
          return fetch(url)
            .then(function (r) { return r.blob(); })
            .then(function (blob) {
              var reader = new FileReader();
              reader.onload = function () {
                rn.postMessage(JSON.stringify({
                  type: 'meta',
                  metadata: { cover: reader.result }
                }));
              };
              reader.readAsDataURL(blob);
            });
        })
        .catch(function () {});
    });

    rendition.on('relocated', function (location) {
      var percent = book.locations.percentageFromCfi(location.start.cfi);
      rn.postMessage(JSON.stringify({
        type: 'onLocationChange',
        totalLocations: book.locations.total,
        currentLocation: location,
        progress: Math.floor(percent * 100)
      }));
    });
  </script>
</body>
</html>`;
}
