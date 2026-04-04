import { buildWebPdfViewerHtml } from '@/assets/pdfjs/viewer-web';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, Pressable, Text } from 'react-native';
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

  const html = useMemo(
    () => buildWebPdfViewerHtml({ resolvedFileUri, base64, base64State, pdfJsCode }),
    [resolvedFileUri, base64, base64State, pdfJsCode]
  );

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

