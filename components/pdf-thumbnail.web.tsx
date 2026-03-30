import { StyleProp, ViewStyle, View } from 'react-native';

export default function PdfThumbnail({
  // Intentionally ignored on web; we can't render native PDF previews here.
  uri: _uri,
  style,
}: {
  uri: string;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[style, { backgroundColor: '#EDEDED' }]} />;
}

