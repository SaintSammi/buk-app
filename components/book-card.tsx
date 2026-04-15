import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import PdfThumbnail from '@/components/pdf-thumbnail';
import { Book, DEFAULT_COVER_URI } from '@/types/models';

function progressPctKey(bookId: string) {
  return `progress-pct:${bookId}`;
}

function statsKey(bookId: string) {
  return `book-stats:${bookId}`;
}

function formatReadTime(ms: number) {
  if (!ms || ms < 60000) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours} h ${remMins} m` : `${hours} h`;
}

type BookCardProps = {
  book: Book;
  onPress: () => void;
  onLongPress: () => void;
};

export default function BookCard({ book, onPress, onLongPress }: BookCardProps) {
  const [readProgress, setReadProgress] = useState(0);
  const [readTimeMs, setReadTimeMs] = useState(0);
  const [cachedCoverUri, setCachedCoverUri] = useState<string | null>(null);

  // When book.coverUri is updated in-memory (e.g. after async extraction), clear
  // the stale AsyncStorage-backed override so the new value shows immediately.
  useEffect(() => {
    if (book.coverUri && book.coverUri !== DEFAULT_COVER_URI) {
      setCachedCoverUri(null);
    }
  }, [book.coverUri]);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(progressPctKey(book.id))
        .then((val) => {
          if (val !== null) setReadProgress(parseFloat(val));
        })
        .catch(() => {});

      AsyncStorage.getItem(statsKey(book.id))
        .then((val) => {
          if (val) {
            try {
              const stats = JSON.parse(val);
              setReadTimeMs(stats.sessionAccumulatedMs || 0);
            } catch {}
          }
        })
        .catch(() => {});

      if (book.sourceType !== 'pdf') {
        AsyncStorage.getItem(`epub-cover:${book.id}`)
          .then((val) => { if (val) setCachedCoverUri(val); })
          .catch(() => {});
      }
    }, [book.id, book.sourceType])
  );

  const authorText = [book.author, book.series].filter(Boolean).join(' · ');
  const timeText = formatReadTime(readTimeMs);

  return (
    <Pressable style={styles.card} onPress={onPress} onLongPress={onLongPress}>
      {book.sourceType === 'pdf' && book.fileUri ? (
        <PdfThumbnail uri={book.fileUri} style={styles.cover} />
      ) : (
        <Image
          source={{ uri: cachedCoverUri ?? book.coverUri ?? DEFAULT_COVER_URI }}
          style={styles.cover}
          contentFit="cover"
          transition={120}
        />
      )}
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={2}>
          {book.title}
        </Text>
        {!!authorText && (
          <View style={styles.metaRow}>
            <Text style={styles.author} numberOfLines={1}>
              {authorText}
            </Text>
            {!!timeText && (
              <Text style={styles.time} numberOfLines={1}>
                {timeText}
              </Text>
            )}
          </View>
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 8,
  },
  author: {
    color: '#6D6D6D',
    fontFamily: 'Manrope_500Medium',
    fontSize: 10,
    lineHeight: 14,
    flex: 1,
  },
  time: {
    color: '#6D6D6D',
    fontFamily: 'Manrope_500Medium',
    fontSize: 10,
    lineHeight: 14,
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
