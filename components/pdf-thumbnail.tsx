/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Platform, StyleProp, ViewStyle } from 'react-native';

export type PdfThumbnailProps = {
  uri: string;
  style?: StyleProp<ViewStyle>;
};

export default function PdfThumbnail(props: PdfThumbnailProps) {
  if (Platform.OS === 'web') {
    // Web is safe: this file is a lightweight placeholder.
    const WebComp = require('./pdf-thumbnail.web').default;
    return <WebComp {...props} />;
  }

  // Native: only attempt to load the native implementation on non-web platforms.
  const NativeComp = require('./pdf-thumbnail.native').default;
  return <NativeComp {...props} />;
}

