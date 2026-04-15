import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Pressable, View, Text } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ReaderHeader } from './reader-header';
import { ReaderFooter } from './reader-footer';
import { ReaderSettings } from './reader-settings';
import { ReaderContents } from './reader-contents';
import type { EpubTocItem } from '@/modules/buk-readium';
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
  bookmarks?: string[];
  toc?: EpubTocItem[];
  currentLocator?: string | null;
  onAddBookmark?: (locator: string) => void;
  onGoto?: (locator: string) => void;
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
  bookmarks = [],
  toc = [],
  currentLocator,
  onAddBookmark,
  onGoto,
}: ReaderLayoutProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'contents'>('settings');
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
        <ReaderHeader 
          title={title} 
          prefs={prefs} 
          currentLocator={currentLocator}
          onOpenSettings={openSettings} 
          onAddBookmark={onAddBookmark}
        />
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
              { backgroundColor: theme.panelBg },
              panelAnimStyle,
            ]}
          >
            <View style={styles.tabRow}>
               <Pressable style={styles.tabBtn} onPress={() => setActiveTab('settings')}>
                 <Text style={[styles.tabText, { color: theme.panelSubtext }, activeTab === 'settings' && { color: theme.label, fontWeight: '700' }]}>APPEARANCE</Text>
               </Pressable>
               <Pressable style={styles.tabBtn} onPress={() => setActiveTab('contents')}>
                 <Text style={[styles.tabText, { color: theme.panelSubtext }, activeTab === 'contents' && { color: theme.label, fontWeight: '700' }]}>CONTENTS</Text>
               </Pressable>
            </View>

            {activeTab === 'settings' ? (
              <ReaderSettings prefs={prefs} updatePrefs={updatePrefs} />
            ) : (
              <ReaderContents toc={toc} bookmarks={bookmarks} onGoto={onGoto} prefs={prefs} />
            )}
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
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.8,
  },
});
