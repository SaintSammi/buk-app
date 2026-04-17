import React from 'react';
import { StyleSheet, View, Pressable, Text, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { READER_THEMES } from '@/constants/reader-theme';
import type { ReaderPrefs } from '@/hooks/use-reader-prefs';

interface ReaderFloatingControlsProps {
  prefs: ReaderPrefs;
  activeTab: 'none' | 'contents' | 'settings';
  onTabPress: (tab: 'contents' | 'settings') => void;
  onAddBookmark?: (locator: string) => void;
  currentLocator?: string | null;
}

export function ReaderFloatingControls({
  prefs,
  activeTab,
  onTabPress,
  onAddBookmark,
  currentLocator,
}: ReaderFloatingControlsProps) {
  const insets = useSafeAreaInsets();
  const theme = READER_THEMES[prefs.themeId];

  // We want the gradient height to be 120 (48 pill + 32 paddingBottom + 40 paddingTop)
  // For safety with notches, we add the bottom inset.
  const gradientHeight = 120 + insets.bottom;

  return (
    <View style={[styles.container, { height: gradientHeight }]}>
      {/* ── Background: Gradient ────────────────────────────────────────────── */}
      {activeTab === 'none' && (
        <LinearGradient
          colors={[theme.bgTransparent, theme.bg]}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
      )}

      {/* ── UI Elements ──────────────────────────────────────────────────────── */}
      <View style={[styles.inner, { bottom: Math.max(insets.bottom, 32) }]}>
        
        {/* Bookmark */}
        <View style={[styles.iconButton, { overflow: 'hidden', backgroundColor: 'transparent' }]}>
          <BlurView 
            intensity={60} 
            tint={theme.bg === '#121212' ? 'dark' : 'light'} 
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFillObject} 
          />
          <Pressable 
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(15, 15, 15, 0.15)', justifyContent: 'center', alignItems: 'center' }]}
            onPress={() => {
              if (onAddBookmark && currentLocator) onAddBookmark(currentLocator);
            }}
          >
            <Feather name="bookmark" size={20} color="#121212" />
          </Pressable>
        </View>

        {/* Segmented Pill */}
        <View style={[styles.segmentedPill, { overflow: 'hidden', backgroundColor: 'transparent' }]}>
          <BlurView 
            intensity={60} 
            tint={theme.bg === '#121212' ? 'dark' : 'light'} 
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFillObject} 
          />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(15, 15, 15, 0.15)' }]} />
          
          <Pressable 
            style={[styles.segmentBtn, activeTab === 'contents' && styles.segmentBtnActive]}
            onPress={() => onTabPress('contents')}
          >
            <Text style={[styles.segmentText, { color: activeTab === 'contents' ? '#FFFFFF' : '#121212' }]}>
              Content
            </Text>
          </Pressable>
          
          <Pressable 
            style={[styles.segmentBtn, activeTab === 'settings' && styles.segmentBtnActive]}
            onPress={() => onTabPress('settings')}
          >
            <Text style={[styles.segmentText, { color: activeTab === 'settings' ? '#FFFFFF' : '#121212' }]}>
              Theme
            </Text>
          </Pressable>
        </View>

        {/* Search */}
        <Pressable 
          style={[styles.iconButton, { backgroundColor: '#0F0F0F' }]}
          onPress={() => Alert.alert("Search", "Search functionality coming soon!")}
        >
          <Feather name="search" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
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
    justifyContent: 'flex-end',
  },
  inner: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
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
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  segmentBtn: {
    flex: 1,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#0F0F0F',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
