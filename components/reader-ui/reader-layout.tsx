import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Pressable, View, Text } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReaderSettings } from './reader-settings';
import { ReaderContents } from './reader-contents';
import { ReaderFloatingControls } from './reader-floating-controls';
import type { EpubTocItem } from '@/modules/buk-readium';
import { READER_THEMES } from '@/constants/reader-theme';
import type { ReaderPrefs } from '@/hooks/use-reader-prefs';

const PANEL_HEIGHT = 500; 

interface ReaderLayoutProps {
  children: React.ReactNode;
  prefs: ReaderPrefs;
  updatePrefs: (patch: Partial<ReaderPrefs>) => void;
  title: string;
  author?: string;
  progressPercent: number;
  position: number;
  positionCount: number;
  controlsVisible: boolean;
  bookmarks?: string[];
  toc?: EpubTocItem[];
  currentLocator?: string | null;
  onAddBookmark?: (locator: string) => void;
  onGoto?: (locator: string) => void;
  onSeek?: (progression: number) => void;
}

export function ReaderLayout({
  children,
  prefs,
  updatePrefs,
  title,
  author,
  progressPercent,
  position,
  positionCount,
  controlsVisible,
  bookmarks = [],
  toc = [],
  currentLocator,
  onAddBookmark,
  onGoto,
  onSeek,
}: ReaderLayoutProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'none' | 'contents' | 'settings'>('none');
  
  // Settings Panel Animation
  const panelY = useSharedValue(PANEL_HEIGHT);
  const backdropAlpha = useSharedValue(0);

  const panelAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelY.value }],
  }));

  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: backdropAlpha.value,
    pointerEvents: backdropAlpha.value === 0 ? 'none' : 'auto',
  }));

  const openPanel = useCallback((tab: 'contents' | 'settings') => {
    setActiveTab(tab);
    panelY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
    backdropAlpha.value = withTiming(1, { duration: 250 });
  }, [panelY, backdropAlpha]);

  const doClosePanel = useCallback(() => {
    setActiveTab('none');
  }, []);

  const closePanel = useCallback(() => {
    panelY.value = withTiming(PANEL_HEIGHT, { duration: 250, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(doClosePanel)();
    });
    backdropAlpha.value = withTiming(0, { duration: 200 });
  }, [panelY, backdropAlpha, doClosePanel]);

  const handleTabPress = useCallback((tab: 'contents' | 'settings') => {
    if (activeTab === tab) {
      closePanel(); // Toggle off if already active
    } else {
      openPanel(tab);
    }
  }, [activeTab, openPanel, closePanel]);

  const theme = READER_THEMES[prefs.themeId];

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Content ───────────────────────────────────────────────────────────── */}
      {children}

      {/* ── Floating Top Header (Minimal) ────────────────────────────────────── */}
      {controlsVisible && (
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 14) }]}>
          <Pressable style={[styles.iconBtn, { backgroundColor: '#121212' }]} onPress={() => router.back()}>
            <Feather name="chevron-left" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
      )}

      {/* ── Bottom Text (Pagination) ─────────────────────────────────────────── */}
      <View style={[styles.bottomPagination, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Text style={[styles.paginationText, { color: theme.label }]}>
           {positionCount > 0 ? `${position} / ${positionCount}` : ''}
        </Text>
      </View>

      {/* ── Settings backdrop + panel ─────────────────────────────────────────── */}
      <Animated.View style={[StyleSheet.absoluteFillObject, styles.backdrop, backdropAnimStyle]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={closePanel} />
      </Animated.View>

      <Animated.View
        style={[
          styles.panelWrapper,
          { backgroundColor: theme.panelBg },
          panelAnimStyle,
        ]}
      >
        {activeTab === 'settings' ? (
          <ReaderSettings prefs={prefs} updatePrefs={updatePrefs} />
        ) : activeTab === 'contents' ? (
          <ReaderContents 
             title={title} 
             author={author} 
             toc={toc} 
             onGoto={onGoto} 
             prefs={prefs} 
             progressPercent={progressPercent}
             position={position}
             positionCount={positionCount}
             onSeek={onSeek}
          />
        ) : null}
      </Animated.View>

      {/* ── Floating Controls Overlay ────────────────────────────────────── */}
      {controlsVisible && (
        <ReaderFloatingControls 
           prefs={prefs}
           activeTab={activeTab}
           onTabPress={handleTabPress}
           onAddBookmark={onAddBookmark}
           currentLocator={currentLocator}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingHorizontal: 16,
    flexDirection: 'row',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  bottomPagination: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5, // Behind controls
    pointerEvents: 'none',
  },
  paginationText: {
    fontSize: 12,
    fontWeight: '500',
  },
  backdrop: {
    zIndex: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.40)', // Dimmer backdrop to focus on bright modal
  },
  panelWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 30, // Important: Below zIndex: 40 of FloatingControls!
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.20,
    shadowRadius: 20,
  },
});
