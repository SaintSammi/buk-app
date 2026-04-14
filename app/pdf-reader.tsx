import { buildWebPdfViewerHtml } from '@/assets/pdfjs/viewer-web';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { ReaderLayout } from '@/components/reader-ui/reader-layout';
import { useReaderPrefs } from '@/hooks/use-reader-prefs';
import { READER_THEMES } from '@/constants/reader-theme';

export default function PdfReaderScreen() {
  const router = useRouter();
  const { title, fileUri } = useLocalSearchParams<{
    title?: string;
    fileUri?: string;
  }>();

  const resolvedFileUri = fileUri ? String(fileUri) : '';
  const resolvedTitle = title ? String(title) : 'PDF Reader';

  const { prefs, updatePrefs, isLoaded: prefsLoaded } = useReaderPrefs();

  const [base64, setBase64] = useState<string | null>(null);
  const [base64State, setBase64State] = useState<'loading' | 'ready' | 'too_large' | 'error'>('loading');
  const [pdfJsCode, setPdfJsCode] = useState<string | null>(null);
  const [pdfJsState, setPdfJsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const webViewRef = React.useRef<WebView>(null);

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
  
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setBase64(null);
      setBase64State('loading');

      if (!resolvedFileUri.startsWith('file://')) return;

      try {
        const info = (await FileSystem.getInfoAsync(resolvedFileUri)) as
          | { exists?: boolean; size?: number }
          | undefined;
        const size =
          info && info.exists && typeof (info as any).size === 'number' ? (info as any).size : undefined;

        // Keep it lightweight: refuse very large PDFs for base64.
        const MAX_BYTES = 30 * 1024 * 1024; // 30MB
        if (size && size > MAX_BYTES) {
          if (!cancelled) setBase64State('too_large');
          return;
        }

        const b64 = await FileSystem.readAsStringAsync(resolvedFileUri, { encoding: 'base64' });
        if (!cancelled) {
          setBase64(b64);
          setBase64State('ready');
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

  const html = useMemo(
    () => buildWebPdfViewerHtml({ resolvedFileUri, base64, base64State, pdfJsCode }),
    [resolvedFileUri, base64, base64State, pdfJsCode]
  );

  const isLoading = !resolvedFileUri || pdfJsState === 'loading' || !prefsLoaded ||
    (resolvedFileUri.startsWith('file://') && base64 === null && base64State === 'loading');

  const theme = prefsLoaded ? READER_THEMES[prefs.themeId] : null;

  if (isLoading || !theme) {
    return (
      <View style={[styles.centered, theme && { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme?.label || '#6D6D6D'} />
      </View>
    );
  }

  const isFileScheme = resolvedFileUri.startsWith('file://');
  const paginationText = totalPages > 0 ? `${currentPage} / ${totalPages}  •  ${Math.round((currentPage / totalPages) * 100)}%` : '';
  const progressPercent = totalPages > 0 ? currentPage / totalPages : 0;

  return (
    <ReaderLayout
      prefs={prefs}
      updatePrefs={updatePrefs}
      title={resolvedTitle}
      progressPercent={progressPercent}
      paginationText={paginationText}
      controlsVisible={controlsVisible}
      onCloseSettings={() => setControlsVisible(true)}
    >
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.pdfWrapper}>
        {/* Toggle controls invisibly when tapping */}
        <View 
          style={styles.tapOverlay} 
          onStartShouldSetResponder={() => true}
          onResponderRelease={() => setControlsVisible((prev) => !prev)}
          pointerEvents="box-none"
        />
        
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
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === 'SET_TOTAL_PAGES') {
                setTotalPages(data.totalPages);
              }
            } catch (e) {
              console.log('[PdfReader] Error parsing message:', e);
            }
          }}
        />
      </View>
    </ReaderLayout>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdfWrapper: {
    flex: 1,
    position: 'relative',
  },
  web: {
    flex: 1,
    backgroundColor: '#222222',
  },
  tapOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    elevation: 10,
  },
});
