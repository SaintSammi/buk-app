import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FlatList, Pressable, StyleSheet, Text, View, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BookCard from '@/components/book-card';
import { useLibrary } from '@/hooks/use-library';
import { Book } from '@/types/models';

export default function HomeScreen() {
  const { books, isLoading, openBook, handleAddBook, handleDeleteBook } = useLibrary();

  const renderBookCard = ({ item }: { item: Book }) => (
    <BookCard
      book={item}
      onPress={() => openBook(item)}
      onLongPress={() => handleDeleteBook(item)}
    />
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

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading your library...</Text>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={styles.listContent}
            data={books}
            keyExtractor={(item) => item.id}
            renderItem={renderBookCard}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No books yet. Start by adding a book!</Text>
              </View>
            }
          />
        )}
      </View>

      <LinearGradient
        pointerEvents="box-none"
        style={styles.bottomBlurFrame}
        colors={['transparent', '#F2F2F2']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}>
        <View style={styles.bottomInner}>
          <Pressable style={styles.addButton} onPress={handleAddBook}>
            <View style={styles.addButtonContent}>
              <Text style={styles.addButtonIcon}>+</Text>
              <Text style={styles.addButtonText}>Add Book</Text>
            </View>
          </Pressable>
        </View>
      </LinearGradient>
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
  bottomBlurFrame: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 117,
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
    paddingVertical: 24,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#6D6D6D',
    fontSize: 16,
    fontFamily: 'Manrope_500Medium',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    color: '#6D6D6D',
    fontSize: 16,
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
});
