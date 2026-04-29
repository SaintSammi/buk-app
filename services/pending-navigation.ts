/**
 * In-memory pending navigation store.
 *
 * Replaces AsyncStorage for pending-goto so the epub-reader's useFocusEffect
 * can read the navigation target synchronously (no I/O), making React render
 * + bridge delivery happen in ~16ms instead of 300ms+. This ensures the
 * cancelPendingRestore() call always beats the 300ms restore timer in Kotlin.
 */

const store: Record<string, string> = {};

export function setPendingNavigation(bookId: string, locator: string): void {
  store[bookId] = locator;
}

export function consumePendingNavigation(bookId: string): string | null {
  const val = store[bookId] ?? null;
  if (val !== null) delete store[bookId];
  return val;
}
