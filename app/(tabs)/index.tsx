import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import PdfThumbnail from '@/components/pdf-thumbnail';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Book = {
  id: string;
  title: string;
  author: string;
  coverUri?: string;
  fileUri?: string;
  sourceType?: 'pdf' | 'other';
};

const DEFAULT_COVER_URI = 'https://covers.openlibrary.org/b/id/8231856-L.jpg';

const defaultBooks: Book[] = [
  {
    id: '1',
    title: 'Pride and Prejudices',
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

function isPdfAsset(asset: { name?: string; mimeType?: string; type?: string } | undefined) {
  const name = asset?.name?.toLowerCase() ?? '';
  const mimeType = asset?.mimeType ?? asset?.type ?? '';
  const uri = (asset as any)?.uri?.toLowerCase?.() ?? '';
  return name.endsWith('.pdf') || String(mimeType).toLowerCase().includes('pdf') || uri.includes('.pdf');
}

function cleanFileNameToTitle(fileName: string) {
  const withoutExt = fileName.replace(/\.[^/.]+$/, '');
  return withoutExt
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function HomeScreen() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>(defaultBooks);

  const openBook = (book: Book) => {
    // Move the last opened book to the top.
    setBooks((prev) => {
      const existing = prev.find((b) => b.id === book.id);
      if (!existing) return prev;
      return [existing, ...prev.filter((b) => b.id !== existing.id)];
    });

    const fileUri = book.fileUri?.toLowerCase() ?? '';
    const pathname =
      book.sourceType === 'pdf' || fileUri.includes('.pdf') ? '/pdf-reader' : '/reader';
    router.push({
      pathname,
      params: { title: book.title, author: book.author || undefined, fileUri: book.fileUri },
    });
  };

  const handleAddBook = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: ['application/epub+zip', 'application/pdf', 'text/plain'],
    });

    if (result.canceled) {
      return;
    }

    const assets = result.assets ?? [];
    if (!assets.length) return;

    const importedBooks: Book[] = assets.map((asset, idx) => {
      const selectedIsPdf = isPdfAsset(asset as unknown as {
        name?: string;
        mimeType?: string;
        type?: string;
      });

      const title = cleanFileNameToTitle(asset.name) || asset.name || 'Untitled Book';
      const author = selectedIsPdf ? 'Unknown Author' : '';

      return {
        id: `${Date.now()}-${idx}`,
        title,
        author,
        fileUri: asset.uri,
        sourceType: selectedIsPdf ? 'pdf' : 'other',
        coverUri: selectedIsPdf ? undefined : DEFAULT_COVER_URI,
      };
    });

    // MVP flow: importing should only add to library (no auto-open).
    // Newest imports first.
    setBooks((prev) => [...importedBooks.reverse(), ...prev]);
  };

  const renderBookCard = ({ item }: { item: Book }) => (
    <Pressable style={styles.card} onPress={() => openBook(item)}>
      {item.sourceType === 'pdf' && item.fileUri ? (
        <PdfThumbnail uri={item.fileUri} style={styles.cover} />
      ) : (
        <Image
          source={{ uri: item.coverUri ?? DEFAULT_COVER_URI }}
          style={styles.cover}
          contentFit="cover"
          transition={120}
        />
      )}
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        {!!item.author && (
          <Text style={styles.author} numberOfLines={1}>
            {item.author}
          </Text>
        )}
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => Alert.alert('Menu', 'Menu action can be connected here.')}
            hitSlop={10}
            style={styles.menuButton}>
            <Feather name="menu" size={24} color="#0B0B0B" />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>My Library</Text>
          </View>
        </View>

        <FlatList
          contentContainerStyle={styles.listContent}
          data={books}
          keyExtractor={(item) => item.id}
          renderItem={renderBookCard}
          showsVerticalScrollIndicator={false}
        />
      </View>

      <View pointerEvents="box-none" style={styles.bottomBlurFrame}>
        <View style={styles.bottomInner}>
          <Pressable style={styles.addButton} onPress={handleAddBook}>
            <View style={styles.addButtonContent}>
              <Text style={styles.addButtonIcon}>+</Text>
              <Text style={styles.addButtonText}>Add Book</Text>
            </View>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F2F2F2',
  },
  content: {
    flex: 1,
    marginTop: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginBottom: 24,
  },
  menuButton: {
    marginRight: 14,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: '#000000',
    fontFamily: 'PlayfairDisplay_500Medium_Italic',
    fontSize: 40,
    lineHeight: 48,
    includeFontPadding: false,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 141,
  },
  card: {
    backgroundColor: '#FFFFFF',
    height: 106,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    overflow: 'hidden',
    marginBottom: 24,
  },
  cover: {
    width: 71,
    height: 106,
  },
  textWrap: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    justifyContent: 'flex-start',
  },
  title: {
    color: '#000000',
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    lineHeight: 18,
  },
  author: {
    color: '#6D6D6D',
    fontFamily: 'Manrope_500Medium',
    fontSize: 10,
    lineHeight: 14,
    marginTop: 4,
  },
  bottomBlurFrame: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 117,
    overflow: 'hidden',
    backgroundColor: '#2F2F2F',
  },
  bottomInner: {
    flex: 1,
    paddingTop: 25,
    paddingBottom: 48,
    paddingHorizontal: 120,
    justifyContent: 'center',
  },
  addButton: {
    backgroundColor: '#121212',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addButtonIcon: {
    color: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    lineHeight: 12,
    includeFontPadding: false,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    lineHeight: 16,
  },
});
