/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { ActivityIndicator, StyleProp, Text, View, ViewStyle } from 'react-native';

export default function PdfThumbnail({
  uri,
  style,
}: {
  uri: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = React.useState(false);
  const resolvedUri = React.useMemo(() => {
    try {
      return decodeURIComponent(uri);
    } catch {
      return uri;
    }
  }, [uri]);

  if (failed) {
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
    <View
      style={[
        style,
        { backgroundColor: '#EFEFEF' },
        { overflow: 'hidden' },
      ]}>
      <Pdf
        source={{ uri: resolvedUri, cache: false }}
        page={1}
        singlePage
        scale={1}
        style={{ flex: 1, backgroundColor: '#EFEFEF' }}
        onError={() => setFailed(true)}
        renderActivityIndicator={() => (
          <ActivityIndicator size="small" color="#6D6D6D" />
        )}
      />
    </View>
  );
}

