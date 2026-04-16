import React, { useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export interface ReaderSliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  steps?: number; // Number of segments (steps - 1 dots)
  activeColor?: string;
  inactiveColor?: string;
  dotColor?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  height?: number; // Height of the track
  hideThumb?: boolean; // Progress bar doesn't use standard thumb
}

export function ReaderSlider({
  value,
  min,
  max,
  onChange,
  steps = 0,
  activeColor = '#121212',
  inactiveColor = '#D9D9D9',
  dotColor = '#EAEAEA',
  leftIcon,
  rightIcon,
  height = 8,
  hideThumb = false,
}: ReaderSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);

  // Math to map value to percentages
  const getPercent = (v: number) => {
    if (v <= min) return 0;
    if (v >= max) return 1;
    return (v - min) / (max - min);
  };

  const progressX = useSharedValue(getPercent(value) * trackWidth);
  const isDragging = useSharedValue(false);

  // Sync incoming value change if not dragging
  React.useEffect(() => {
    if (trackWidth > 0) {
      if (!isDragging.value) {
        progressX.value = withTiming(getPercent(value) * trackWidth, {
          duration: 150,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, trackWidth]);

  const onLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const notifyChange = (px: number) => {
    let p = px / trackWidth;
    p = Math.max(0, Math.min(1, p));
    let rawVal = min + p * (max - min);

    // Snap to nearest step if steps provided
    if (steps > 1) {
      const stepVal = (max - min) / steps;
      rawVal = Math.round((rawVal - min) / stepVal) * stepVal + min;
    }

    onChange(rawVal);
  };

  const panGesture = Gesture.Pan()
    .onBegin((e) => {
      isDragging.value = true;
      progressX.value = e.x;
    })
    .onUpdate((e) => {
      progressX.value = Math.max(0, Math.min(e.x, trackWidth));
    })
    .onEnd(() => {
      isDragging.value = false;
      runOnJS(notifyChange)(progressX.value);
    });

  const tapGesture = Gesture.Tap().onEnd((e) => {
    runOnJS(notifyChange)(e.x);
  });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  const fillStyle = useAnimatedStyle(() => ({
    width: progressX.value,
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progressX.value - (hideThumb ? 0 : 8) }],
  }));

  // Render dots
  const numberOfDots = steps > 1 ? steps - 1 : 0;
  const dots = [];
  for (let i = 1; i <= numberOfDots; i++) {
    dots.push(
      <View
        key={i}
        style={[
          styles.dot,
          {
            backgroundColor: dotColor,
            left: `${(i / steps) * 100}%`,
          },
        ]}
      />
    );
  }

  return (
    <View style={styles.container}>
      {leftIcon && <View style={styles.iconContainer}>{leftIcon}</View>}

      <GestureDetector gesture={composedGesture}>
        <View style={styles.trackWrapper} onLayout={onLayout}>
          <View
            style={[
              styles.track,
              { backgroundColor: inactiveColor, height, borderRadius: height / 2 },
            ]}
          >
            {dots}
            <Animated.View
              style={[
                styles.fill,
                { backgroundColor: activeColor, borderRadius: height / 2 },
                fillStyle,
              ]}
            />
          </View>

          {!hideThumb && (
            <Animated.View
              style={[
                styles.thumb,
                { backgroundColor: activeColor },
                thumbStyle,
              ]}
            >
              <View style={styles.thumbInner} />
            </Animated.View>
          )}
        </View>
      </GestureDetector>

      {rightIcon && <View style={styles.iconContainer}>{rightIcon}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
  },
  iconContainer: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackWrapper: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  track: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  dot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    marginLeft: -2,
    zIndex: 1,
  },
  thumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  thumbInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
});
