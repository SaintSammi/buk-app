/* eslint-disable @typescript-eslint/no-require-imports */
import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

// Lazy load AsyncStorage to avoid errors in Expo Go
const getAsyncStorage = () => {
  try {
    return require('@react-native-async-storage/async-storage').default;
  } catch {
    return null;
  }
};

export default function PdfReaderNativeScreen() {
  const { title, fileUri, bookId } = useLocalSearchParams<{
    bookId?: string;
    title?: string;
    fileUri?: string;
  }>();

  const resolvedFileUri = fileUri ? String(fileUri) : '';
  const resolvedBookId = bookId ? String(bookId) : '';
  const AsyncStorage = getAsyncStorage();
  const progressKey = resolvedBookId && AsyncStorage ? `pdf-progress:${resolvedBookId}` : '';
  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [isProgressReady, setIsProgressReady] = React.useState<boolean>(!progressKey);

  const Pdf = React.useMemo(() => {
    try {
      return require('react-native-pdf').default ?? require('react-native-pdf');
    } catch {
      return null;
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function loadProgress() {
      if (!progressKey || !AsyncStorage) {
        setCurrentPage(1);
        setIsProgressReady(true);
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
      } finally {
        if (!cancelled) setIsProgressReady(true);
      }
    }

    loadProgress();

    return () => {
      cancelled = true;
    };
  }, [progressKey]);

  if (!resolvedFileUri) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#6D6D6D" />
      </View>
    );
  }

  if (!isProgressReady) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#6D6D6D" />
      </View>
    );
  }

  if (Pdf) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: title ? String(title) : 'PDF' }} />
        <Pdf
          source={{ uri: resolvedFileUri, cache: true }}
          style={styles.pdf}
          page={currentPage}
          scale={1}
          horizontal={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          scrollEnabled
          onPageChanged={(page: number) => {
            setCurrentPage(page);
            if (progressKey && AsyncStorage) {
              AsyncStorage.setItem(progressKey, String(page)).catch(() => {});
            }
          }}
          // Resume from saved page while keeping vertical scroll enabled.
          renderActivityIndicator={() => <ActivityIndicator size="small" color="#6D6D6D" />}
        />
      </View>
    );
  }

  // Expo Go fallback (if native pdf can't load).
  const safeUri = encodeURI(resolvedFileUri).replace(/"/g, '&quot;');
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          html, body { margin: 0; padding: 0; height: 100%; background: #000; }
          embed { width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        <embed src="${safeUri}" type="application/pdf" />
      </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: title ? String(title) : 'PDF' }} />
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.pdf}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        mixedContentMode="always"
        scrollEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  pdf: {
    flex: 1,
    backgroundColor: '#000',
  },
});

