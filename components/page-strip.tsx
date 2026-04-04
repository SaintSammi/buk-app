import React, { memo, useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

type PageStripProps = {
  currentPage: number;
  prevUri: string | null;
  currentUri: string | null;
  nextUri: string | null;
  translateX: Animated.Value;
  getPageBase: (page: number) => Animated.Value;
};

// Individual page slot — memoized so that when currentPage changes,
// a slot whose props haven't changed (same page, same uri, same base)
// skips re-render entirely. This prevents expo-image from re-evaluating
// its source and avoids any decode flash.
const PageSlot = memo(function PageSlot({
  uri,
  translateX,
  base,
}: {
  page: number; // used for key only
  uri: string | null;
  translateX: Animated.Value;
  base: Animated.Value;
}) {
  // Animated.add is created ONCE per page and never rebuilt,
  // because both translateX and base are stable object references.
  // Only their internal numeric values change via setValue().
  const panX = useMemo(
    () => Animated.add(translateX, base),
    [translateX, base]
  );

  // Memoize the source object so expo-image doesn't think it changed
  const source = useMemo(() => (uri ? { uri } : null), [uri]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.page, { transform: [{ translateX: panX }] }]}
    >
      {source ? (
        <Image source={source} style={styles.fill} contentFit="contain" />
      ) : (
        <View style={styles.placeholder} />
      )}
    </Animated.View>
  );
});

export default function PageStrip({
  currentPage,
  prevUri,
  currentUri,
  nextUri,
  translateX,
  getPageBase,
}: PageStripProps) {
  const pages = useMemo(() => {
    // Z-ORDER IS CRITICAL.
    // Current page must be rendered LAST so it's always the top layer.
    //
    // Why: when currentPage changes (e.g. N→N+1), React creates the new
    // "next" page (N+2) during render. Before useLayoutEffect fires,
    // N+2's position = dragX(-sw) + base(+sw) = 0 (center!).
    // If N+2 were on top, it would briefly cover N+1 with a black placeholder.
    // By rendering current last, N+1 always covers any rogue pages beneath it.
    return [
      { page: currentPage - 1, uri: prevUri },
      { page: currentPage + 1, uri: nextUri },
      { page: currentPage, uri: currentUri },  // top layer — always visible
    ].filter((p) => p.page > 0);
  }, [currentPage, prevUri, currentUri, nextUri]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {pages.map(({ page, uri }) => (
        <PageSlot
          key={page}
          page={page}
          uri={uri}
          translateX={translateX}
          base={getPageBase(page)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    // 1px overlap on each side prevents sub-pixel hairline gaps
    // between adjacent pages during drag. The overlap is invisible
    // because the image uses contentFit="contain" on a black bg.
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -1,
    right: -1,
  },
  fill: {
    flex: 1,
    backgroundColor: '#000',
  },
  placeholder: {
    flex: 1,
    backgroundColor: '#121212',
  },
});
