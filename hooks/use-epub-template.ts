import { useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

// These are the same JS bundles that @epubjs-react-native/core ships internally.
// Importing them here adds zero extra bundle size because Reader.js already
// transitively includes them. We just bypass the library's React components.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jszipContent: string = require('@epubjs-react-native/core/lib/commonjs/jszip').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const epubjsContent: string = require('@epubjs-react-native/core/lib/commonjs/epubjs').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const htmlTemplate: string = require('@epubjs-react-native/core/lib/commonjs/template').default;

export interface EpubTemplateOptions {
  /** file:// URI of the epub file on device storage */
  src: string;
  /** epub.js theme object — map of CSS selector to property/value pairs */
  theme?: Record<string, Record<string, string>>;
  /** 'paginated' (default) or 'scrolled' */
  flow?: string;
}

export interface EpubTemplateResult {
  /** file:// URI of the assembled HTML — pass to BukEpubWebView `src` prop */
  templateUri: string | null;
  isReady: boolean;
  error: string | null;
}

/**
 * Prepares the epub.js HTML template on disk.
 *
 * On first call it writes jszip.min.js and epub.min.js to documentDirectory
 * (skipped on subsequent calls if the files already exist).  The HTML template
 * is regenerated each time `src` changes and written to
 * epub_template.html inside documentDirectory.
 */
export function useEpubTemplate(options: EpubTemplateOptions): EpubTemplateResult {
  const [result, setResult] = useState<EpubTemplateResult>({
    templateUri: null,
    isReady: false,
    error: null,
  });

  // Stable ref so the async effect always reads the latest options
  const latestOptions = useRef(options);
  latestOptions.current = options;

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      const docDir = FileSystem.documentDirectory ?? '';
      const jszipUri = `${docDir}jszip.min.js`;
      const epubjsUri = `${docDir}epub.min.js`;
      const templateUri = `${docDir}epub_template.html`;

      // ── 1. Write JS libraries (one-time) ─────────────────────────────────
      try {
        const jszipInfo = await FileSystem.getInfoAsync(jszipUri);
        if (!jszipInfo.exists) {
          await FileSystem.writeAsStringAsync(jszipUri, jszipContent);
        }
        const epubjsInfo = await FileSystem.getInfoAsync(epubjsUri);
        if (!epubjsInfo.exists) {
          await FileSystem.writeAsStringAsync(epubjsUri, epubjsContent);
        }
      } catch {
        if (!cancelled) {
          setResult({ templateUri: null, isReady: false, error: 'Failed to write JS assets to disk' });
        }
        return;
      }

      if (cancelled) return;

      // ── 2. Assemble HTML template ─────────────────────────────────────────
      const { src, theme = {}, flow = 'paginated' } = latestOptions.current;

      // Escape the file path for embedding in a JS string literal
      const safeSrc = src.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

      const html = htmlTemplate
        .replace(/<script id="jszip"><\/script>/, `<script src="${jszipUri}"></script>`)
        .replace(/<script id="epubjs"><\/script>/, `<script src="${epubjsUri}"></script>`)
        .replace(/const type = window\.type;/, `const type = 'binary';`)
        .replace(/const file = window\.book;/, `const file = '${safeSrc}';`)
        .replace(/const theme = window\.theme;/, `const theme = ${JSON.stringify(theme)};`)
        .replace(/const initialLocations = window\.locations;/, `const initialLocations = undefined;`)
        .replace(/const enableSelection = window\.enable_selection;/, `const enableSelection = false;`)
        .replace(/allowScriptedContent: allowScriptedContent/, `allowScriptedContent: false`)
        .replace(/allowPopups: allowPopups/, `allowPopups: false`)
        .replace(/manager: "default"/, `manager: "default"`)
        .replace(/flow: "auto"/, `flow: ${JSON.stringify(flow)}`)
        .replace(/snap: undefined/, `snap: undefined`)
        .replace(/spread: undefined/, `spread: undefined`)
        .replace(/fullsize: undefined/, `fullsize: undefined`);

      // ── 3. Write HTML template ─────────────────────────────────────────────
      try {
        await FileSystem.writeAsStringAsync(templateUri, html);
      } catch {
        if (!cancelled) {
          setResult({ templateUri: null, isReady: false, error: 'Failed to write HTML template to disk' });
        }
        return;
      }

      if (!cancelled) {
        setResult({ templateUri, isReady: true, error: null });
      }
    }

    prepare();
    return () => {
      cancelled = true;
    };
  }, [options.src]); // regenerate when the book file changes

  return result;
}
