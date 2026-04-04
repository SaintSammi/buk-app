import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Book,
  DEFAULT_COVER_URI,
  cleanFileNameToTitle,
  defaultBooks,
  isPdfAsset,
} from '@/types/models';

const STORAGE_KEY = 'books';

export function useLibrary() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>(defaultBooks);
  const [isLoading, setIsLoading] = useState(true);

  // Load books from storage on mount
  useEffect(() => {
    let cancelled = false;

    async function loadBooks() {
      try {
        const savedBooks = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled) {
          if (savedBooks) {
            setBooks(JSON.parse(savedBooks));
          }
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadBooks();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist books whenever they change (skip during initial load)
  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(books)).catch(() => {});
    }
  }, [books, isLoading]);

  const openBook = useCallback(
    async (book: Book) => {
      const uri = book.fileUri ?? '';
      if (uri.startsWith('file://')) {
        try {
          const info = await FileSystem.getInfoAsync(uri);
          if (!(info as { exists?: boolean })?.exists) {
            Alert.alert(
              'File Missing',
              'This imported file is no longer available on device storage. Please remove it and add the book again.'
            );
            return;
          }
        } catch {
          Alert.alert(
            'File Error',
            'Unable to access this file. Please remove it and add the book again.'
          );
          return;
        }
      }

      // Move the last opened book to the top.
      setBooks((prev) => {
        const existing = prev.find((b) => b.id === book.id);
        if (!existing) return prev;
        return [existing, ...prev.filter((b) => b.id !== existing.id)];
      });

      router.push({
        pathname: '/pdf-reader',
        params: {
          bookId: book.id,
          title: book.title,
          author: book.author || undefined,
          fileUri: book.fileUri,
        },
      });
    },
    [router]
  );

  const handleAddBook = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: ['application/epub+zip', 'application/pdf', 'text/plain'],
    });

    if (result.canceled) return;

    const assets = result.assets ?? [];
    if (!assets.length) return;

    const importedBooks: Book[] = [];

    // Ensure persistent cache directory exists
    const persistentCacheDir = `${FileSystem.cacheDirectory}buk-books/`;
    try {
      const dirInfo = await FileSystem.getInfoAsync(persistentCacheDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(persistentCacheDir, { intermediates: true });
      }
    } catch {
      Alert.alert('Error', 'Failed to create storage directory');
      return;
    }

    for (let idx = 0; idx < assets.length; idx++) {
      const asset = assets[idx];
      const selectedIsPdf = isPdfAsset(asset as unknown as {
        name?: string;
        mimeType?: string;
        type?: string;
      });

      const title = cleanFileNameToTitle(asset.name) || asset.name || 'Untitled Book';
      const author = selectedIsPdf ? 'Unknown Author' : '';
      let fileUri = asset.uri;

      // For PDFs, copy to persistent cache to survive content:// URI expiry
      if (selectedIsPdf && fileUri.startsWith('content://')) {
        try {
          const persistentUri = `${persistentCacheDir}${Date.now()}-${idx}-${asset.name}`;
          await FileSystem.copyAsync({ from: fileUri, to: persistentUri });
          fileUri = persistentUri;
        } catch (error) {
          console.warn(`Failed to copy PDF ${asset.name}:`, error);
        }
      }

      importedBooks.push({
        id: `${Date.now()}-${idx}`,
        title,
        author,
        fileUri,
        sourceType: selectedIsPdf ? 'pdf' : 'other',
        coverUri: selectedIsPdf ? undefined : DEFAULT_COVER_URI,
      });
    }

    // Newest imports first
    setBooks((prev) => [...importedBooks.reverse(), ...prev]);
  }, []);

  const handleDeleteBook = useCallback((book: Book) => {
    Alert.alert(
      'Remove Book',
      `Remove "${book.title}" from your library?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => setBooks((prev) => prev.filter((b) => b.id !== book.id)),
        },
      ]
    );
  }, []);

  return { books, isLoading, openBook, handleAddBook, handleDeleteBook };
}
