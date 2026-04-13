import React, { useEffect, useRef } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import WebView from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type BukMessageEvent = {
  nativeEvent: { message: string };
};

type BukEpubWebViewProps = {
  style?: StyleProp<ViewStyle>;
  /** URI of the pre-built HTML template that loads the EPUB via epub.js */
  src: string;
  /**
   * JSON-encoded object `{ id: number; script: string }`.
   * Changing this prop causes `script` to be injected into the WebView.
   */
  injectJS?: string;
  onBukMessage?: (event: BukMessageEvent) => void;
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function BukEpubWebView({
  style,
  src,
  injectJS,
  onBukMessage,
}: BukEpubWebViewProps) {
  const webViewRef = useRef<WebView>(null);
  const lastInjectedIdRef = useRef<unknown>(null);

  useEffect(() => {
    if (!injectJS) return;
    try {
      const parsed = JSON.parse(injectJS) as { id: unknown; script: string };
      if (parsed.id === lastInjectedIdRef.current) return;
      lastInjectedIdRef.current = parsed.id;
      if (parsed.script) {
        // The trailing `; true;` is required by Android WebView
        webViewRef.current?.injectJavaScript(parsed.script + '\ntrue;');
      }
    } catch {
      // ignore malformed injectJS
    }
  }, [injectJS]);

  const handleMessage = (event: WebViewMessageEvent) => {
    onBukMessage?.({ nativeEvent: { message: event.nativeEvent.data } });
  };

  return (
    <WebView
      ref={webViewRef}
      style={style}
      source={{ uri: src }}
      onMessage={handleMessage}
      originWhitelist={['*']}
      allowFileAccess
      allowUniversalAccessFromFileURLs
      javaScriptEnabled
      mixedContentMode="always"
    />
  );
}
