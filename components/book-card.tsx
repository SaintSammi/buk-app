import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import PdfThumbnail from '@/components/pdf-thumbnail';
import { Book, DEFAULT_COVER_URI } from '@/types/models';

type BookCardProps = {
  book: Book;
  onPress: () => void;
  onLongPress: () => void;
};

export default function BookCard({ book, onPress, onLongPress }: BookCardProps) {
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
});
