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

  // We want the gradient to fade to the exact background of the theme.
  const gradientColors = ['transparent', theme.bg];

  return (
    <View style={[styles.container, { height: 120 + insets.bottom }]}>
      {/* ── Background: Blur + Gradient ────────────────────────────────────── */}
      <BlurView intensity={20} style={StyleSheet.absoluteFillObject} tint={prefs.themeId === 'night' ? 'dark' : 'light'} />
      <LinearGradient
        colors={gradientColors}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0.2 }}
        end={{ x: 0, y: 1 }}
      />

      {/* ── UI Elements ──────────────────────────────────────────────────────── */}
      <View style={[styles.inner, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        
        {/* Bookmark */}
        <Pressable 
          style={[styles.iconButton, { backgroundColor: '#E5E5E5' }]}
          onPress={() => {
            if (onAddBookmark && currentLocator) onAddBookmark(currentLocator);
          }}
        >
          <Feather name="bookmark" size={20} color="#121212" />
        </Pressable>

        {/* Segmented Pill */}
        <View style={[styles.segmentedPill, { backgroundColor: '#E5E5E5' }]}>
          <Pressable 
            style={[styles.segmentBtn, activeTab === 'contents' && { backgroundColor: '#121212' }]}
            onPress={() => onTabPress('contents')}
          >
            <Text style={[styles.segmentText, { color: activeTab === 'contents' ? '#FFFFFF' : '#687076' }]}>
              Content
            </Text>
          </Pressable>
          
          <Pressable 
            style={[styles.segmentBtn, activeTab === 'settings' && { backgroundColor: '#121212' }]}
            onPress={() => onTabPress('settings')}
          >
            <Text style={[styles.segmentText, { color: activeTab === 'settings' ? '#FFFFFF' : '#687076' }]}>
              Theme
            </Text>
          </Pressable>
        </View>

        {/* Search Placeholder */}
        <Pressable 
          style={[styles.iconButton, { backgroundColor: '#121212' }]}
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
    padding: 4,
    flex: 1,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  segmentBtn: {
    flex: 1,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
