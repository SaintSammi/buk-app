import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ReaderHeader } from './reader-header';
import { ReaderFooter } from './reader-footer';
import { ReaderSettings } from './reader-settings';
import { READER_THEMES } from '@/constants/reader-theme';
import type { ReaderPrefs } from '@/hooks/use-reader-prefs';

const PANEL_HEIGHT = 400; // slightly taller to account for content + padding

interface ReaderLayoutProps {
  children: React.ReactNode;
  prefs: ReaderPrefs;
  updatePrefs: (patch: Partial<ReaderPrefs>) => void;
  title: string;
  chapterTitle?: string;
  progressPercent: number;
  paginationText?: string;
  controlsVisible: boolean;
  onCloseSettings?: () => void;
}

export function ReaderLayout({
  children,
  prefs,
  updatePrefs,
  title,
  chapterTitle,
  progressPercent,
  paginationText,
  controlsVisible,
  onCloseSettings,
}: ReaderLayoutProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const tempControlsVisibleRef = useRef(controlsVisible);

  // Settings Panel Animation
  const panelY = useSharedValue(PANEL_HEIGHT);
  const backdropAlpha = useSharedValue(0);

  const panelAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelY.value }],
  }));

  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: backdropAlpha.value,
  }));

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
    panelY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
    backdropAlpha.value = withTiming(1, { duration: 250 });
  }, [panelY, backdropAlpha]);

  const doCloseSettings = useCallback(() => {
    setSettingsOpen(false);
    onCloseSettings?.();
  }, [onCloseSettings]);

  const closeSettings = useCallback(() => {
    panelY.value = withTiming(PANEL_HEIGHT, { duration: 250, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(doCloseSettings)();
    });
    backdropAlpha.value = withTiming(0, { duration: 200 });
  }, [panelY, backdropAlpha, doCloseSettings]);

  const theme = READER_THEMES[prefs.themeId];

  // We only show controls if controlsVisible is true AND settings are closed,
  // OR if settings are open (we might want header visible? No, usually hidden behind backdrop).
  // In the original implementation, header/footer were rendered if controlsVisible was true.
  // The backdrop sat in front of them anyway. We'll stick to that logic.

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Content ───────────────────────────────────────────────────────────── */}
      {children}

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      {controlsVisible && (
        <ReaderHeader title={title} prefs={prefs} onOpenSettings={openSettings} />
      )}

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      {controlsVisible && (
        <ReaderFooter
          prefs={prefs}
          title={title}
          chapterTitle={chapterTitle}
          progressPercent={progressPercent}
          paginationText={paginationText}
        />
      )}

      {/* ── Settings backdrop + panel ─────────────────────────────────────────── */}
      {settingsOpen && (
        <>
          <Animated.View style={[StyleSheet.absoluteFillObject, styles.backdrop, backdropAnimStyle]}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={closeSettings} />
          </Animated.View>

          <Animated.View
            style={[
              styles.panelWrapper,
              panelAnimStyle,
            ]}
          >
            <ReaderSettings prefs={prefs} updatePrefs={updatePrefs} />
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    zIndex: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.50)',
  },
  panelWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.30,
    shadowRadius: 16,
    overflow: 'hidden',
  },
});
