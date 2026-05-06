import { Image } from 'expo-image';
import React from 'react';
import { Clipboard, Dimensions, Pressable, Share, StyleSheet, View } from 'react-native';

export const HIGHLIGHT_COLORS = ['#FFA2A2', '#FFE1A2', '#F3A2FF', '#A2FFDA'] as const;

const copyIcon   = require('@/assets/copy-01.svg');
const shareIcon  = require('@/assets/share-08.svg');

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

  const handleCopy = () => Clipboard.setString(selectedText);

  const handleShare = async () => {
    const message = bookTitle ? `"${selectedText}" — ${bookTitle}` : `"${selectedText}"`;
    await Share.share({ message });
  };

  const handleSwatchPress = (color: string) => {
    if (existingId && existingColorHex === color) onRemove?.();
    else onApplyColor(color);
  };

  return (
    <View style={[styles.toolbar, { top, left }]}>
      {/* Copy */}
      <Pressable onPress={handleCopy} style={styles.action} hitSlop={6}>
        <Image source={copyIcon} style={styles.icon} contentFit="contain" />
      </Pressable>

      {/* Share */}
      <Pressable onPress={handleShare} style={styles.action} hitSlop={6}>
        <Image source={shareIcon} style={styles.icon} contentFit="contain" />
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
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: PAD_H,
    height: TOOLBAR_HEIGHT,
    width: TOOLBAR_WIDTH,
    gap: GAP,
    elevation: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  action: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
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
