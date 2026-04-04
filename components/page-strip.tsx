import React, { useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

type PageStripProps = {
  prevUri: string | null;
  currentUri: string | null;
  nextUri: string | null;
  translateX: Animated.Value;
  forwardOffsetAnim: Animated.Value;
  backwardOffsetAnim: Animated.Value;
};

export default function PageStrip({
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

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Prev page slides in from the left (positive offset from translateX) */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { transform: [{ translateX: backwardTranslateX }] }]}
      >
        {prevUri ? (
          <Image source={{ uri: prevUri }} style={styles.fill} contentFit="contain" />
        ) : (
          <View style={styles.placeholder} />
        )}
      </Animated.View>

      {/* Next page slides in from the right (negative offset from translateX) */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { transform: [{ translateX: forwardTranslateX }] }]}
      >
        {nextUri ? (
          <Image source={{ uri: nextUri }} style={styles.fill} contentFit="contain" />
        ) : (
          <View style={styles.placeholder} />
        )}
      </Animated.View>

      {/* Current page sits at translateX */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}
      >
        {currentUri ? (
          <Image source={{ uri: currentUri }} style={styles.fill} contentFit="contain" />
        ) : (
          <View style={styles.placeholder} />
        )}
      </Animated.View>
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
