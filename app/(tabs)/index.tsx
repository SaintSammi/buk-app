import { useMemo } from 'react';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import {
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Book = {
  id: string;
  title: string;
  author: string;
  coverUri: string;
};

const BOOKS: Book[] = [
  {
    id: '1',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    coverUri: 'https://covers.openlibrary.org/b/id/8231856-L.jpg',
  },
  {
    id: '2',
    title: "Alice's Adventures in Wonderland",
    author: 'Lewis Carroll',
    coverUri: 'https://covers.openlibrary.org/b/id/8225631-L.jpg',
  },
  {
    id: '3',
    title: 'Frankenstein',
    author: 'Mary Shelley',
    coverUri: 'https://covers.openlibrary.org/b/id/7222246-L.jpg',
  },
  {
    id: '4',
    title: 'Moby-Dick',
    author: 'Herman Melville',
    coverUri: 'https://covers.openlibrary.org/b/id/5551656-L.jpg',
  },
  {
    id: '5',
    title: 'The Adventures of Sherlock Holmes',
    author: 'Sir Arthur Conan Doyle',
    coverUri: 'https://covers.openlibrary.org/b/id/8228691-L.jpg',
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();

  const listBottomPadding = useMemo(() => tabBarHeight + 96, [tabBarHeight]);
  const addButtonBottom = useMemo(() => tabBarHeight + 16, [tabBarHeight]);

  const openBook = (book: Book) => {
    router.push({
      pathname: '/reader',
      params: { title: book.title, author: book.author },
    });
  };

  const handleAddBook = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['application/epub+zip', 'application/pdf', 'text/plain'],
    });

    if (result.canceled) {
      return;
    }

    const selectedFile = result.assets[0];

    router.push({
      pathname: '/reader',
      params: { title: selectedFile.name, fileUri: selectedFile.uri },
    });
  };

  const renderBookCard = ({ item }: { item: Book }) => (
    <Pressable style={styles.card} onPress={() => openBook(item)}>
      <Image source={{ uri: item.coverUri }} style={styles.cover} contentFit="cover" transition={120} />
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.author} numberOfLines={1}>
          {item.author}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => Alert.alert('Menu', 'Menu action can be connected here.')}
          hitSlop={10}
          style={styles.menuButton}>
          <Feather name="menu" size={24} color="#F1F1F1" />
        </Pressable>
        <Text style={styles.headerTitle}>My library</Text>
      </View>

      <FlatList
        contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPadding }]}
        data={BOOKS}
        keyExtractor={(item) => item.id}
        renderItem={renderBookCard}
        showsVerticalScrollIndicator={false}
      />

      <Pressable style={[styles.addButton, { bottom: addButtonBottom }]} onPress={handleAddBook}>
        <Text style={styles.addButtonText}>+  Add Book</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 18,
    gap: 14,
  },
  menuButton: {
    padding: 2,
  },
  headerTitle: {
    color: '#F5F5F5',
    fontSize: 48,
    fontStyle: 'italic',
    fontWeight: '500',
    lineHeight: 52,
  },
  listContent: {
    paddingHorizontal: 20,
    gap: 14,
  },
  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    minHeight: 98,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 3,
  },
  cover: {
    width: 86,
    height: '100%',
  },
  textWrap: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  title: {
    color: '#F2F2F2',
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '500',
  },
  author: {
    color: '#B8B8B8',
    fontSize: 18,
    lineHeight: 22,
    marginTop: 6,
  },
  addButton: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 4,
  },
  addButtonText: {
    color: '#FAFAFA',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '600',
  },
});
