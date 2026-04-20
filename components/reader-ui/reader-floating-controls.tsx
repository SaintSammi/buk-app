import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Pressable, Text, Alert } from 'react-native';
import Animated, { 
  FadeIn, 
  FadeOut, 
  LinearTransition, 
  useAnimatedStyle, 
  useSharedValue, 
  withTiming,
  Easing
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ReaderThemeId, READER_THEMES } from '@/constants/reader-theme';
import type { ReaderPrefs } from '@/hooks/use-reader-prefs';
import { ReaderSettings } from './reader-settings';
import { ReaderContents } from './reader-contents';
import type { EpubTocItem } from '@/modules/buk-readium';

interface ReaderFloatingControlsProps {
  prefs: ReaderPrefs;
  updatePrefs: (patch: Partial<ReaderPrefs>) => void;
  activeTab: 'none' | 'contents' | 'settings';
  onTabPress: (tab: 'contents' | 'settings') => void;
  onAddBookmark?: (locator: string) => void;
  currentLocator?: string | null;
  isBookmarked?: boolean;
  bookmarkCount?: number;
  // Panel props
  title: string;
  author?: string;
  toc?: EpubTocItem[];
  progressPercent: number;
  position: number;
  positionCount: number;
  onSeek?: (progression: number) => void;
  onGoto?: (locator: string) => void;
}

function getGradientColors(bgHex: string): string[] {
  let r = 255, g = 255, b = 255;
  if (bgHex.toUpperCase() === '#0F0F0F') {
    r = 15; g = 15; b = 15;
  } else if (bgHex.toUpperCase() === '#F5ECE3') {
    r = 245; g = 236; b = 227;
  }
  return [
    `rgba(${r}, ${g}, ${b}, 0)`,
    `rgba(${r}, ${g}, ${b}, 0.75)`,
    `rgba(${r}, ${g}, ${b}, 0.96)`,
    `rgba(${r}, ${g}, ${b}, 0.99)`,
    `rgba(${r}, ${g}, ${b}, 1)`
  ];
}

export function ReaderFloatingControls({
  prefs,
  updatePrefs,
  activeTab,
  onTabPress,
  onAddBookmark,
  currentLocator,
  isBookmarked = false,
  bookmarkCount = 0,
  title,
  author,
  toc = [],
  progressPercent,
  position,
  positionCount,
  onSeek,
  onGoto,
}: ReaderFloatingControlsProps) {
  const insets = useSafeAreaInsets();
  const theme = READER_THEMES[prefs.themeId];

  const gradientStops = getGradientColors(theme.bg);

  // Selector Animation
  const tabX = useSharedValue(activeTab === 'settings' ? 1 : 0);
  const prevTabRef = useRef(activeTab);

  useEffect(() => {
    const targetX = activeTab === 'settings' ? 1 : 0;
    
    // Only animate if we are switching BETWEEN the two active tabs (not coming from 'none')
    if (prevTabRef.current !== 'none' && activeTab !== 'none' && prevTabRef.current !== activeTab) {
      tabX.value = withTiming(targetX, { 
        duration: 250, 
        easing: Easing.bezier(0.33, 1, 0.68, 1) 
      });
    } else {
      tabX.value = targetX;
    }
    
    prevTabRef.current = activeTab;
  }, [activeTab]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabX.value * 100 + '%' }], 
    opacity: activeTab === 'none' ? 0 : 1,
  }));

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* ── Background: Gradient ────────────────────────────────────────────── */}
      <LinearGradient
        colors={gradientStops}
        locations={[0, 0.3462, 0.476, 0.6154, 1]}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
      />

      {/* ── UI Elements Frame ────────────────────────────────────────────────── */}
      <Animated.View 
        layout={LinearTransition}
        style={[styles.unifiedFrame, { paddingBottom: Math.max(insets.bottom, 32) }]} 
        pointerEvents="box-none"
      >
        
        {/* Menu/Panel Area */}
        {activeTab === 'settings' && (
          <Animated.View 
            entering={FadeIn.duration(200)} 
            exiting={FadeOut.duration(200)}
            style={[styles.panelCard, { backgroundColor: theme.panelBg }]}
          >
            <ReaderSettings prefs={prefs} updatePrefs={updatePrefs} />
          </Animated.View>
        )}
        {activeTab === 'contents' && (
          <Animated.View 
            entering={FadeIn.duration(200)} 
            exiting={FadeOut.duration(200)}
            style={[styles.panelCard, { backgroundColor: theme.panelBg }]}
          >
            <ReaderContents 
              title={title} 
              author={author} 
              toc={toc} 
              bookmarkCount={bookmarkCount}
              onGoto={onGoto} 
              prefs={prefs} 
              progressPercent={progressPercent}
              position={position}
              positionCount={positionCount}
              onSeek={onSeek}
            />
          </Animated.View>
        )}

        {/* Pills Row */}
        <View style={styles.pillsRow} pointerEvents="box-none">
          {/* Bookmark */}
          <Pressable 
            style={[styles.iconButton, { backgroundColor: theme.controlsBg }]}
            onPress={() => {
              if (onAddBookmark && currentLocator) onAddBookmark(currentLocator);
            }}
          >
            <Image
              source={require('@/assets/icons/bookmark.svg')}
              style={styles.iconImg}
              tintColor={isBookmarked ? '#FF3131' : '#BEBEBE'}
              contentFit="contain"
            />
          </Pressable>

          {/* Segmented Pill */}
          <View style={[styles.segmentedPill, { backgroundColor: theme.controlsBg }]}>
            {/* Sliding Indicator */}
            <Animated.View 
              style={[
                styles.activeIndicator, 
                { backgroundColor: theme.pillActive },
                indicatorStyle
              ]} 
            />

            <Pressable 
              style={styles.segmentBtn}
              onPress={() => onTabPress('contents')}
            >
              <Text style={[styles.segmentText, { color: activeTab === 'contents' ? theme.pillActiveFg : theme.icon }]}>
                Content
              </Text>
            </Pressable>
            
            <Pressable 
              style={styles.segmentBtn}
              onPress={() => onTabPress('settings')}
            >
              <Text style={[styles.segmentText, { color: activeTab === 'settings' ? theme.pillActiveFg : theme.icon }]}>
                Theme
              </Text>
            </Pressable>
          </View>

          {/* Search */}
          <Pressable 
            style={[styles.iconButton, { backgroundColor: theme.pillActive }]}
            onPress={() => Alert.alert("Search", "Search functionality coming soon!")}
          >
            <Image
              source={require('@/assets/icons/search.svg')}
              style={styles.iconImg}
              tintColor={theme.pillActiveFg}
              contentFit="contain"
            />
          </Pressable>
        </View>

      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 40,
  },
  unifiedFrame: {
    width: '100%',
    paddingTop: 32,
    paddingHorizontal: 12,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
  },
  panelCard: {
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  segmentedPill: {
    flexDirection: 'row',
    height: 48,
    borderRadius: 24,
    flex: 1,
    marginHorizontal: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    position: 'relative',
    overflow: 'hidden',
  },
  activeIndicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '50%',
    borderRadius: 24,
  },
  segmentBtn: {
    flex: 1,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    fontWeight: '700',
    includeFontPadding: false,
  },
  iconImg: {
    width: 24,
    height: 24,
  },
});
