import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useShareQuoteFonts, SHARE_FONTS } from '@/hooks/use-share-quote-fonts';

// ─── Palette ─────────────────────────────────────────────────────────────────

const COLORS: { label: string; hex: string; key: 'Orange' | 'Green' | 'DarkBlue' | 'Black' | 'Seablue' }[] = [
  { label: 'Orange',   hex: '#B85C00', key: 'Orange'   },
  { label: 'Green',    hex: '#2E5D3B', key: 'Green'    },
  { label: 'DarkBlue', hex: '#1A2D6B', key: 'DarkBlue' },
  { label: 'Black',    hex: '#0F0F0F', key: 'Black'    },
  { label: 'Seablue',  hex: '#006B8F', key: 'Seablue'  },
];

type PatternKey = 'Orange' | 'Green' | 'DarkBlue' | 'Black' | 'Seablue';
type PatternIndex = 0 | 1 | 2;

// Static requires — Metro needs these to be literal strings
const PATTERN_SVGS: Record<PatternIndex, Record<PatternKey, ReturnType<typeof require>>> = {
  0: {
    Orange:   require('@/assets/share/Pattern 1, Orange.svg'),
    Green:    require('@/assets/share/Pattern 1, Green.svg'),
    DarkBlue: require('@/assets/share/Pattern 1, DarkBlue.svg'),
    Black:    require('@/assets/share/Pattern 1, Black.svg'),
    Seablue:  require('@/assets/share/Pattern 1, Seablue.svg'),
  },
  1: {
    Orange:   require('@/assets/share/Pattern 2, Orange.svg'),
    Green:    require('@/assets/share/Pattern 2, Green.svg'),
    DarkBlue: require('@/assets/share/Pattern 2, DarkBlue.svg'),
    Black:    require('@/assets/share/Pattern 2, Black.svg'),
    Seablue:  require('@/assets/share/Pattern 2, Seablue.svg'),
  },
  2: {
    Orange:   require('@/assets/share/Pattern 3, Orange.svg'),
    Green:    require('@/assets/share/Pattern 3, Green.svg'),
    DarkBlue: require('@/assets/share/Pattern 3, DarkBlue.svg'),
    Black:    require('@/assets/share/Pattern 3, Black.svg'),
    Seablue:  require('@/assets/share/Pattern 3, Seablue.svg'),
  },
};

const SELECTOR_SVGS = [
  require('@/assets/share/Pattern 1 Selector.svg'),
  require('@/assets/share/Pattern 2 Selector.svg'),
  require('@/assets/share/Pattern 3 Selector.svg'),
];

// ─── Share destinations ───────────────────────────────────────────────────────

interface ShareDest {
  id: string;
  label: string;
  icon: ReturnType<typeof require>;
  action: 'save' | 'share';
  packageName?: string; // Android intent package
}

const SHARE_DESTINATIONS: ShareDest[] = [
  { id: 'save',      label: 'Save',      icon: require('@/assets/share/Save.svg'),      action: 'save' },
  { id: 'stories',   label: 'Stories',   icon: require('@/assets/share/Stories.svg'),   action: 'share', packageName: 'com.instagram.android' },
  { id: 'whatsapp',  label: 'WhatsApp',  icon: require('@/assets/share/WhatsApp.svg'),  action: 'share', packageName: 'com.whatsapp' },
  { id: 'snapchat',  label: 'Snapchat',  icon: require('@/assets/share/Snapchat.svg'),  action: 'share', packageName: 'com.snapchat.android' },
  { id: 'message',   label: 'Message',   icon: require('@/assets/share/Message.svg'),   action: 'share', packageName: 'com.instagram.android' },
  { id: 'x',         label: 'X',         icon: require('@/assets/share/X.svg'),         action: 'share', packageName: 'com.twitter.android' },
  { id: 'facebook',  label: 'Facebook',  icon: require('@/assets/share/Facebook.svg'),  action: 'share', packageName: 'com.facebook.katana' },
];

// ─── Layout constants (from screenshots) ─────────────────────────────────────

const { width: SW } = Dimensions.get('window');
// Sheet horizontal padding: 24dp each side
const SHEET_PAD_H = 24;
// Card fills sheet width minus 2×24 padding
const CARD_WIDTH = SW - SHEET_PAD_H * 2;
// Card aspect: design is ~182×322 (from SVG viewBox) → ratio ~1.77
const CARD_HEIGHT = Math.round(CARD_WIDTH * (322 / 182));
// Selector thumbnails: 33×60dp (from SVG viewBox), clipped to show ~20dp
const SELECTOR_W = 33;
const SELECTOR_H = 60;
// Color circles: 40dp diameter, 16dp gap
const COLOR_CIRCLE = 40;
const COLOR_GAP = 16;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ShareQuoteSheetProps {
  visible: boolean;
  selectedText: string;       // may be '' if opened without highlight
  bookTitle: string;
  bookAuthor: string;
  coverUri: string | null;    // file:// URI or null
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ShareQuoteSheet({
  visible,
  selectedText,
  bookTitle,
  bookAuthor,
  coverUri,
  onClose,
}: ShareQuoteSheetProps) {
  const insets = useSafeAreaInsets();
  const fontsLoaded = useShareQuoteFonts();

  const [patternIdx, setPatternIdx] = useState<PatternIndex>(0);
  const [colorIdx, setColorIdx]     = useState(0);
  const [fontIdx, setFontIdx]       = useState(0);
  const [capturing, setCapturing]   = useState(false);

  const cardRef = useRef<ViewShot>(null);

  // ── Sheet slide-up animation ──────────────────────────────────────────────
  const translateY = useSharedValue(600);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 250 });
      translateY.value = withSpring(0, { damping: 28, stiffness: 300 });
    } else {
      backdropOpacity.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(600, { duration: 220, easing: Easing.bezier(0.32, 0, 0.67, 0) });
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  // ── Colour / pattern helpers ──────────────────────────────────────────────
  const currentColor = COLORS[colorIdx];
  const currentFont  = SHARE_FONTS[fontIdx % SHARE_FONTS.length];
  const patternSvg   = PATTERN_SVGS[patternIdx][currentColor.key];

  const prevPattern = () => setPatternIdx(i => ((i - 1 + 3) % 3) as PatternIndex);
  const nextPattern = () => setPatternIdx(i => ((i + 1) % 3) as PatternIndex);
  const prevFont    = () => setFontIdx(i => (i - 1 + SHARE_FONTS.length) % SHARE_FONTS.length);
  const nextFont    = () => setFontIdx(i => (i + 1) % SHARE_FONTS.length);

  // Prev/next selector indices
  const prevIdx = ((patternIdx - 1 + 3) % 3) as PatternIndex;
  const nextIdx = ((patternIdx + 1) % 3) as PatternIndex;

  // ── Capture ───────────────────────────────────────────────────────────────
  const captureCard = useCallback(async (): Promise<string | null> => {
    try {
      if (!cardRef.current) return null;
      // @ts-ignore — capture is on the instance
      const uri: string = await cardRef.current.capture({ format: 'png', quality: 1 });
      return uri;
    } catch (e) {
      console.warn('ShareQuoteSheet: capture failed', e);
      return null;
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Allow access to Photos to save the image.');
        return;
      }
      const uri = await captureCard();
      if (!uri) return;
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved!', 'Image saved to your gallery.');
    } finally {
      setCapturing(false);
    }
  }, [capturing, captureCard]);

  const handleShare = useCallback(async (dest: ShareDest) => {
    if (dest.action === 'save') { handleSave(); return; }
    if (capturing) return;
    setCapturing(true);
    try {
      const uri = await captureCard();
      if (!uri) return;
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Sharing unavailable', 'Cannot share images on this device.');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share quote' });
    } finally {
      setCapturing(false);
    }
  }, [capturing, captureCard, handleSave]);

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* ── Dimmed backdrop ──────────────────────────────────────────────── */}
      <Animated.View style={[StyleSheet.absoluteFillObject, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      {/* ── Sheet ────────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }, sheetStyle]}>
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* ── Carousel row: prev selector + card + next selector ─────── */}
        <View style={styles.carouselRow}>
          {/* Prev pattern thumbnail */}
          <Pressable onPress={prevPattern} style={styles.selectorWrap} hitSlop={12}>
            <Image
              source={SELECTOR_SVGS[prevIdx]}
              style={styles.selectorImg}
              contentFit="cover"
            />
          </Pressable>

          {/* The capturable card */}
          <ViewShot
            ref={cardRef}
            options={{ format: 'png', quality: 1 }}
            style={[styles.card, { width: CARD_WIDTH, height: CARD_HEIGHT }]}
          >
            {/* Pattern fills card entirely */}
            <Image
              source={patternSvg}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
            />

            {/* Quote text — centered, vertically padded from top (48dp) and bottom (attribution area ~70dp) */}
            <View style={styles.quoteArea}>
              <Text
                style={[styles.quoteText, fontsLoaded ? { fontFamily: currentFont.fontFamily } : undefined]}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                numberOfLines={10}
              >
                {selectedText || bookTitle}
              </Text>
            </View>

            {/* Attribution row at card bottom */}
            <View style={styles.attribution}>
              {coverUri ? (
                <Image
                  source={{ uri: coverUri }}
                  style={styles.coverThumb}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.coverThumb, styles.coverPlaceholder]} />
              )}
              <View style={styles.attributionText}>
                <Text style={styles.bookTitle} numberOfLines={1}>{bookTitle}</Text>
                <Text style={styles.bookAuthor} numberOfLines={1}>{bookAuthor}</Text>
              </View>
            </View>
          </ViewShot>

          {/* Next pattern thumbnail */}
          <Pressable onPress={nextPattern} style={styles.selectorWrap} hitSlop={12}>
            <Image
              source={SELECTOR_SVGS[nextIdx]}
              style={styles.selectorImg}
              contentFit="cover"
            />
          </Pressable>
        </View>

        {/* ── Color picker ─────────────────────────────────────────────── */}
        <View style={styles.colorRow}>
          {COLORS.map((c, i) => (
            <Pressable
              key={c.key}
              onPress={() => setColorIdx(i)}
              style={styles.colorDotWrap}
              hitSlop={6}
            >
              <View style={[styles.colorDot, { backgroundColor: c.hex }]} />
              {i === colorIdx && <View style={styles.colorRing} />}
            </Pressable>
          ))}
        </View>

        {/* ── Font picker ──────────────────────────────────────────────── */}
        <View style={styles.fontRow}>
          <Pressable onPress={prevFont} hitSlop={12} style={styles.fontArrow}>
            <Image
              source={require('@/assets/share/arrow-left.svg')}
              style={styles.arrowIcon}
              contentFit="contain"
            />
          </Pressable>
          <Text
            style={[
              styles.fontPreview,
              fontsLoaded ? { fontFamily: currentFont.fontFamily } : undefined,
            ]}
          >
            Abc
          </Text>
          <Pressable onPress={nextFont} hitSlop={12} style={styles.fontArrow}>
            <Image
              source={require('@/assets/share/arrow-right.svg')}
              style={styles.arrowIcon}
              contentFit="contain"
            />
          </Pressable>
        </View>

        {/* ── Share destinations ───────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.shareRow}
        >
          {SHARE_DESTINATIONS.map((dest) => (
            <Pressable
              key={dest.id}
              style={styles.shareBtn}
              onPress={() => handleShare(dest)}
              disabled={capturing}
            >
              <Image source={dest.icon} style={styles.shareIcon} contentFit="contain" />
              <Text style={styles.shareLabel}>{dest.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Backdrop
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 0,
  },

  // Sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: SHEET_PAD_H,
    gap: 24, // 24dp between every section
    zIndex: 1,
  },

  // Drag handle
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D0D0D0',
    marginBottom: 0, // gap: 24 on sheet handles spacing
  },

  // Carousel
  carouselRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // No horizontal padding here — card fills SHEET_PAD_H zone,
    // selectors visually overflow to create carousel feel
  },
  selectorWrap: {
    width: SELECTOR_W,
    height: SELECTOR_H,
    borderRadius: 6,
    overflow: 'hidden',
    opacity: 0.6,
  },
  selectorImg: {
    width: SELECTOR_W,
    height: SELECTOR_H,
  },
  card: {
    flex: 1, // fills space between the two selectors
    borderRadius: 12,
    overflow: 'hidden',
    marginHorizontal: 8, // small gap between card and selectors
  },
  quoteArea: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    // Bottom: leave room for attribution (~70dp)
    bottom: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quoteText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
  },
  attribution: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  coverThumb: {
    width: 32,
    height: 48,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  coverPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  attributionText: {
    flex: 1,
  },
  bookTitle: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  bookAuthor: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    lineHeight: 14,
  },

  // Color picker
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: COLOR_GAP,
  },
  colorDotWrap: {
    width: COLOR_CIRCLE,
    height: COLOR_CIRCLE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorDot: {
    width: COLOR_CIRCLE,
    height: COLOR_CIRCLE,
    borderRadius: COLOR_CIRCLE / 2,
  },
  colorRing: {
    position: 'absolute',
    width: COLOR_CIRCLE + 6,
    height: COLOR_CIRCLE + 6,
    borderRadius: (COLOR_CIRCLE + 6) / 2,
    borderWidth: 2,
    borderColor: '#111111',
  },

  // Font picker
  fontRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  fontArrow: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowIcon: {
    width: 24,
    height: 24,
  },
  fontPreview: {
    fontSize: 48,
    fontWeight: '700',
    color: '#111111',
    lineHeight: 58,
  },

  // Share row
  shareRow: {
    paddingHorizontal: 0,
    gap: 16,
    alignItems: 'center',
  },
  shareBtn: {
    alignItems: 'center',
    gap: 6,
    minWidth: 64,
  },
  shareIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  shareLabel: {
    fontSize: 12,
    color: '#333333',
    textAlign: 'center',
  },
});
