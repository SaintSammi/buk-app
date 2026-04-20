import React, { useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export interface ReaderSliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  onDragChange?: (val: number) => void;
  steps?: number;
  activeColor?: string;
  inactiveColor?: string;
  dotColor?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  activeIconColor?: string;
  inactiveIconColor?: string;
  height?: number;
  hideThumb?: boolean;
}

export function ReaderSlider({
  value,
  min,
  max,
  onChange,
  onDragChange,
  steps = 0,
  activeColor = '#121212',
  inactiveColor = '#D9D9D9',
  dotColor = '#EAEAEA',
  leftIcon,
  rightIcon,
  activeIconColor = '#FFFFFF',
  inactiveIconColor = '#121212',
  height = 8,
  hideThumb = false,
}: ReaderSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthSv = useSharedValue(0);

  const getPercent = (v: number) => {
    if (v <= min) return 0;
    if (v >= max) return 1;
    return (v - min) / (max - min);
  };

  const progressX = useSharedValue(getPercent(value) * trackWidth);
  const isDragging = useSharedValue(false);

  React.useEffect(() => {
    if (trackWidth > 0 && !isDragging.value) {
      progressX.value = withTiming(getPercent(value) * trackWidth, { duration: 150 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, trackWidth]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setTrackWidth(w);
    trackWidthSv.value = w;
    progressX.value = getPercent(value) * w;
  };

  const OVERSHOOT = 16;

  const snapPx = (px: number, tw: number): number => {
    'worklet';
    if (steps <= 1 || tw <= 0) return px;
    const stepPx = tw / steps;
    return Math.round(px / stepPx) * stepPx;
  };

  // Visual fill goes slightly past the snap point
  const fillX = useDerivedValue(() => {
    if (progressX.value <= 0) return 0;
    return Math.min(trackWidthSv.value, progressX.value + OVERSHOOT);
  });

  const notifyChange = (px: number) => {
    const tw = trackWidthSv.value;
    let p = tw > 0 ? px / tw : 0;
    p = Math.max(0, Math.min(1, p));
    onChange(min + p * (max - min));
  };

  const notifyDragChange = (px: number) => {
    if (!onDragChange) return;
    const tw = trackWidthSv.value;
    let p = tw > 0 ? px / tw : 0;
    p = Math.max(0, Math.min(1, p));
    onDragChange(min + p * (max - min));
  };

  const panGesture = Gesture.Pan()
    .onBegin((e) => {
      isDragging.value = true;
      const px = snapPx(Math.max(0, Math.min(e.x, trackWidthSv.value)), trackWidthSv.value);
      progressX.value = px;
      runOnJS(notifyDragChange)(px);
    })
    .onUpdate((e) => {
      const px = snapPx(Math.max(0, Math.min(e.x, trackWidthSv.value)), trackWidthSv.value);
      progressX.value = px;
      runOnJS(notifyDragChange)(px);
    })
    .onEnd(() => {
      isDragging.value = false;
      runOnJS(notifyChange)(progressX.value);
    });

  const tapGesture = Gesture.Tap().onEnd((e) => {
    const px = snapPx(Math.max(0, Math.min(e.x, trackWidthSv.value)), trackWidthSv.value);
    progressX.value = withTiming(px, { duration: 150 });
    runOnJS(notifyChange)(px);
  });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  const fillStyle = useAnimatedStyle(() => ({ width: fillX.value }));

  const cloneWithColor = (node: React.ReactNode, color: string): React.ReactNode => {
    if (!React.isValidElement(node)) return node;
    const el = node as React.ReactElement<any>;
    return React.cloneElement(el, { color, style: [el.props.style, { color }] });
  };

  const ICON_FADE_RANGE = 14; // px over which icon crossfades
  const LEFT_ICON_CENTER = 24;  // approx px from left edge to left icon center
  const RIGHT_ICON_OFFSET = 24; // approx px from right edge to right icon center

  const leftOnFillStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      fillX.value,
      [LEFT_ICON_CENTER - ICON_FADE_RANGE / 2, LEFT_ICON_CENTER + ICON_FADE_RANGE / 2],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));
  const leftOnInactiveStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      fillX.value,
      [LEFT_ICON_CENTER - ICON_FADE_RANGE / 2, LEFT_ICON_CENTER + ICON_FADE_RANGE / 2],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  const rightOnFillStyle = useAnimatedStyle(() => {
    const threshold = trackWidthSv.value - RIGHT_ICON_OFFSET;
    return {
      opacity: interpolate(
        fillX.value,
        [threshold - ICON_FADE_RANGE / 2, threshold + ICON_FADE_RANGE / 2],
        [0, 1],
        Extrapolation.CLAMP
      ),
    };
  });
  const rightOnInactiveStyle = useAnimatedStyle(() => {
    const threshold = trackWidthSv.value - RIGHT_ICON_OFFSET;
    return {
      opacity: interpolate(
        fillX.value,
        [threshold - ICON_FADE_RANGE / 2, threshold + ICON_FADE_RANGE / 2],
        [1, 0],
        Extrapolation.CLAMP
      ),
    };
  });

  const rightIconStyle = useAnimatedStyle(() => ({
    zIndex: trackWidthSv.value > 0 && progressX.value >= trackWidthSv.value ? 10 : 2,
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progressX.value - 10 }],
  }));

  const numberOfDots = steps > 1 ? steps - 1 : 0;
  const dots = [];
  for (let i = 1; i <= numberOfDots; i++) {
    dots.push(
      <View
        key={i}
        style={[styles.dot, { backgroundColor: dotColor, left: `${(i / steps) * 100}%` }]}
      />
    );
  }

  return (
    <GestureDetector gesture={composedGesture}>
      <View style={styles.trackWrapper} onLayout={onLayout}>
        <View style={[styles.track, { backgroundColor: inactiveColor, height, borderRadius: height / 2 }]}>
          {dots}
          <Animated.View
            style={[styles.fill, { backgroundColor: activeColor, borderRadius: height / 2 }, fillStyle]}
          />
        </View>

        {leftIcon && (
          <View pointerEvents="none" style={styles.innerLeftIcon}>
            <View style={{ opacity: 0 }}>{leftIcon}</View>
            <Animated.View style={[StyleSheet.absoluteFillObject, styles.iconCenter, leftOnInactiveStyle]}>
              {cloneWithColor(leftIcon, inactiveIconColor)}
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFillObject, styles.iconCenter, leftOnFillStyle]}>
              {cloneWithColor(leftIcon, activeIconColor)}
            </Animated.View>
          </View>
        )}
        {rightIcon && (
          <Animated.View pointerEvents="none" style={[styles.innerRightIcon, rightIconStyle]}>
            <View style={{ opacity: 0 }}>{rightIcon}</View>
            <Animated.View style={[StyleSheet.absoluteFillObject, styles.iconCenter, rightOnInactiveStyle]}>
              {cloneWithColor(rightIcon, inactiveIconColor)}
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFillObject, styles.iconCenter, rightOnFillStyle]}>
              {cloneWithColor(rightIcon, activeIconColor)}
            </Animated.View>
          </Animated.View>
        )}

        {!hideThumb && (
          <Animated.View style={[styles.thumb, { backgroundColor: activeColor }, thumbStyle]} />
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  trackWrapper: {
    position: 'relative',
    justifyContent: 'center',
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
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: -3,
    top: '50%',
    marginTop: -3,
    zIndex: 1,
  },
  thumb: {
    position: 'absolute',
    width: 20,
    height: 8,
    borderRadius: 4,
  },
  innerLeftIcon: {
    position: 'absolute',
    left: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 2,
  },
  innerRightIcon: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 2,
  },
  iconCenter: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
