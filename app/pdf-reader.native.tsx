/* eslint-disable @typescript-eslint/no-require-imports */
import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

export default function PdfReaderNativeScreen() {
  const { title, fileUri } = useLocalSearchParams<{
    title?: string;
    fileUri?: string;
  }>();

  const resolvedFileUri = fileUri ? String(fileUri) : '';

  const Pdf = React.useMemo(() => {
    try {
      return require('react-native-pdf').default ?? require('react-native-pdf');
    } catch {
      return null;
    }
  }, []);

  if (!resolvedFileUri) {
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
          scale={1}
          horizontal={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          scrollEnabled
          // Render whole document and allow vertical scrolling.
          // Leaving `page` undefined lets the component manage its own pagination/scroll.
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

