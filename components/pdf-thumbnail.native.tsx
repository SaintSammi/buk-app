/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import Constants from 'expo-constants';
import { ActivityIndicator, StyleProp, Text, View, ViewStyle } from 'react-native';

export default function PdfThumbnail({
  uri,
  style,
}: {
  uri: string;
  style?: StyleProp<ViewStyle>;
}) {
  // `react-native-pdf` is native-only and will not work in Expo Go.
  // Return a lightweight placeholder so the app stays stable.
  const isExpoGo = Constants.appOwnership === 'expo';
  if (isExpoGo) {
    return (
      <View style={[style, { backgroundColor: '#EDEDED' }, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: '#6D6D6D', fontWeight: '700' }}>PDF</Text>
      </View>
    );
  }

  // For custom/dev builds where native deps exist, render page 1.
  let Pdf: any;
  try {
    Pdf = require('react-native-pdf').default ?? require('react-native-pdf');
  } catch {
    return (
      <View
        style={[
          style,
          { backgroundColor: '#EDEDED' },
          { alignItems: 'center', justifyContent: 'center' },
        ]}>
        <Text style={{ color: '#6D6D6D', fontWeight: '700' }}>PDF</Text>
      </View>
    );
  }

  return (
    <Pdf
      source={{ uri, cache: true }}
      page={1}
      singlePage
      scale={1}
      style={style}
      renderActivityIndicator={() => (
        <ActivityIndicator size="small" color="#6D6D6D" />
      )}
    />
  );
}

