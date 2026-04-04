import React, { useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

type PageStripProps = {
  currentPage: number;
  prevUri: string | null;
  currentUri: string | null;
  nextUri: string | null;
  translateX: Animated.Value;
  forwardOffsetAnim: Animated.Value;
  backwardOffsetAnim: Animated.Value;
};

export default function PageStrip({
  currentPage,
  prevUri,
  currentUri,
  nextUri,
  translateX,
  forwardOffsetAnim,
  backwardOffsetAnim,
}: PageStripProps) {
  const forwardTranslateX = useMemo(
    () => Animated.add(translateX, forwardOffsetAnim),
    [translateX, forwardOffsetAnim]
  );
  const backwardTranslateX = useMemo(
    () => Animated.add(translateX, backwardOffsetAnim),
    [translateX, backwardOffsetAnim]
  );

  const pages = useMemo(() => {
    return [
      { page: currentPage - 1, uri: prevUri, position: 'prev' as const },
      { page: currentPage, uri: currentUri, position: 'curr' as const },
      { page: currentPage + 1, uri: nextUri, position: 'next' as const },
    ].filter((p) => p.page > 0);
  }, [currentPage, prevUri, currentUri, nextUri]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {pages.map(({ page, uri, position }) => {
        const panX =
          position === 'prev'
            ? backwardTranslateX
            : position === 'next'
            ? forwardTranslateX
            : translateX;

        return (
          <Animated.View
            key={page}
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { transform: [{ translateX: panX }] }]}
          >
            {uri ? (
              <Image source={{ uri }} style={styles.fill} contentFit="contain" />
            ) : (
              <View style={styles.placeholder} />
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: '#000',
  },
  placeholder: {
    flex: 1,
    backgroundColor: '#121212',
  },
});
