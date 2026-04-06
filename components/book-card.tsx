import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import PdfThumbnail from '@/components/pdf-thumbnail';
import { Book, DEFAULT_COVER_URI } from '@/types/models';

function progressPctKey(bookId: string) {
  return `progress-pct:${bookId}`;
}

type BookCardProps = {
  book: Book;
  onPress: () => void;
  onLongPress: () => void;
};

export default function BookCard({ book, onPress, onLongPress }: BookCardProps) {
  const [readProgress, setReadProgress] = useState(0);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(progressPctKey(book.id))
        .then((val) => {
          if (val !== null) setReadProgress(parseFloat(val));
        })
        .catch(() => {});
    }, [book.id])
  );

  return (
    <Pressable style={styles.card} onPress={onPress} onLongPress={onLongPress}>
      {book.sourceType === 'pdf' && book.fileUri ? (
        <PdfThumbnail uri={book.fileUri} style={styles.cover} />
      ) : (
        <Image
          source={{ uri: book.coverUri ?? DEFAULT_COVER_URI }}
          style={styles.cover}
          contentFit="cover"
          transition={120}
        />
      )}
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={2}>
          {book.title}
        </Text>
        {!!book.author && (
          <Text style={styles.author} numberOfLines={1}>
            {book.author}
          </Text>
        )}
        {readProgress > 0 && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${readProgress * 100}%` }]} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    height: 106,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
    marginBottom: 16,
  },
  cover: {
    width: 80,
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
  progressTrack: {
    marginTop: 8,
    height: 2,
    backgroundColor: '#E0E0E0',
    borderRadius: 1,
  },
  progressFill: {
    height: 2,
    backgroundColor: '#0B0B0B',
    borderRadius: 1,
  },
});
