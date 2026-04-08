import { requireNativeViewManager } from 'expo-modules-core';
import type { StyleProp, ViewStyle } from 'react-native';

export interface BukMessageEvent {
  nativeEvent: {
    /** Raw JSON string posted by epub.js via window.ReactNativeWebView.postMessage */
    message: string;
  };
}

export interface BukTapEvent {
  nativeEvent: {
    /** Tap X position in logical dp */
    x: number;
    /** Tap Y position in logical dp */
    y: number;
  };
}

export interface BukEpubWebViewProps {
  style?: StyleProp<ViewStyle>;

  /**
   * file:// URI of the assembled epub.js HTML template written to disk by
   * useEpubTemplate(). The native view calls WebView.loadUrl(src) whenever
   * this prop changes.
   */
  src?: string;

  /**
   * Serialised command for the inner WebView's evaluateJavascript.
   * Shape: JSON.stringify({ id: Date.now(), script: "rendition.next()" })
   * The native side executes the script each time the `id` field changes,
   * so callers must bump the id for repeated same-script invocations.
   */
  injectJS?: string;

  /** Fired for every window.ReactNativeWebView.postMessage call from epub.js */
  onBukMessage?: (event: BukMessageEvent) => void;

  /** Fired on a tap that was not classified as a horizontal swipe */
  onBukTap?: (event: BukTapEvent) => void;
}

// Module name must match Name("BukEpubReader") declared in BukEpubReaderModule.kt
const BukEpubWebView = requireNativeViewManager<BukEpubWebViewProps>('BukEpubReader');
export { BukEpubWebView };
