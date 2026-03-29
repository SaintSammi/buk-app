import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function ReaderScreen() {
  const { title, author } = useLocalSearchParams<{
    title?: string;
    author?: string;
    fileUri?: string;
  }>();

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: title ? String(title) : 'Reader', headerBackTitle: 'Library' }} />
      <View style={styles.container}>
        <Text style={styles.title}>{title ? String(title) : 'Untitled Book'}</Text>
        {!!author && <Text style={styles.author}>{String(author)}</Text>}
        <Text style={styles.note}>
          Reader screen is ready for your reading view integration.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#F3F3F3',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    textAlign: 'center',
  },
  author: {
    marginTop: 8,
    color: '#BDBDBD',
    fontSize: 20,
    lineHeight: 24,
  },
  note: {
    marginTop: 18,
    color: '#9F9F9F',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
});
