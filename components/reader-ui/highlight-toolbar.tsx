import React from 'react';
import { Dimensions, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

export const HIGHLIGHT_COLORS = ['#FFA2A2', '#FFE1A2', '#F3A2FF', '#A2FFDA'] as const;

// Gap between every item, outer horizontal padding (matches design spec)
const GAP = 16;
const PAD_H = 12;
// action + sep + 4 swatches
// 2×24 + (PAD_H×2) + 1 sep + (GAP × 6 gaps between 7 children) + 4×24
const ICON_SIZE  = 24;
const SWATCH_SIZE = 24;
const SEP_W = 1;
const TOOLBAR_WIDTH =
  PAD_H * 2 +
  ICON_SIZE + GAP + ICON_SIZE + GAP + SEP_W + GAP +
  SWATCH_SIZE + GAP + SWATCH_SIZE + GAP + SWATCH_SIZE + GAP + SWATCH_SIZE;
const TOOLBAR_HEIGHT = 48;

interface HighlightToolbarProps {
  selectedText: string;
  selX: number;
  selY: number;
  selWidth: number;
  selHeight: number;
  existingId?: string | null;
  existingColorHex?: string | null;
  bookTitle?: string;
  onApplyColor: (colorHex: string) => void;
  onRemove?: () => void;
}

export function HighlightToolbar({
  selectedText,
  selX,
  selY,
  selWidth,
  selHeight,
  existingId,
  existingColorHex,
  bookTitle,
  onApplyColor,
  onRemove,
}: HighlightToolbarProps) {
  const { width: sw } = Dimensions.get('window');

  // Always below the selection, clamped horizontally
  const top  = selY + selHeight + 12;
  const left = Math.max(8, Math.min(selX + selWidth / 2 - TOOLBAR_WIDTH / 2, sw - TOOLBAR_WIDTH - 8));

  const handleCopy = () => {
    Clipboard.setStringAsync(selectedText);
    // Optionally remove if desired, but we'll stick to original logic
  };

  const handleShare = async () => {
    const message = bookTitle ? `"${selectedText}" — ${bookTitle}` : `"${selectedText}"`;
    await Share.share({ message });
  };

  const handleSwatchPress = (color: string) => {
    if (existingId && existingColorHex === color) onRemove?.();
    else onApplyColor(color);
  };

  return (
    <View 
      style={[styles.toolbar, { top, left }]}
      onStartShouldSetResponder={() => true}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {/* Copy */}
      <Pressable onPress={handleCopy} style={styles.action} hitSlop={6}>
        <Text style={styles.iconText}>⎘</Text>
      </Pressable>

      {/* Share */}
      <Pressable onPress={handleShare} style={styles.action} hitSlop={6}>
        <Text style={styles.iconText}>↑</Text>
      </Pressable>

      {/* Divider */}
      <View style={styles.sep} />

      {/* Color swatches */}
      {HIGHLIGHT_COLORS.map((color) => {
        const isActive = existingColorHex === color;
        return (
          <Pressable
            key={color}
            onPress={() => handleSwatchPress(color)}
            style={styles.swatchWrap}
            hitSlop={4}
          >
            <View style={[styles.swatch, { backgroundColor: color }]} />
            {isActive && <View style={styles.swatchRing} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    position: 'absolute',
    zIndex: 60,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 33,
    paddingHorizontal: PAD_H,
    height: TOOLBAR_HEIGHT,
    width: TOOLBAR_WIDTH,
    gap: GAP,
    // Design-spec shadow (most prominent layer: 0 3px 7px rgba(0,0,0,0.10))
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
  },
  action: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 16,
    color: '#333',
  },
  sep: {
    width: SEP_W,
    height: 20,
    backgroundColor: '#E5E5E5',
  },
  swatchWrap: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: SWATCH_SIZE / 2,
  },
  swatchRing: {
    position: 'absolute',
    width: SWATCH_SIZE + 6,
    height: SWATCH_SIZE + 6,
    borderRadius: (SWATCH_SIZE + 6) / 2,
    borderWidth: 2,
    borderColor: '#333',
  },
});
