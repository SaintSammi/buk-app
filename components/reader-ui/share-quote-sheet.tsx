import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
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

const DRAG_BAR_ICON = require('@/assets/share/Drag bar.svg');
const PATTERN_SVGS: Record<PatternIndex, Record<PatternKey, number>> = {
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
  icon: number;
  action: 'save' | 'share';
  packageName?: string; // Android intent package
}

const SHARE_DESTINATIONS: ShareDest[] = [
  { id: 'save',      label: 'Save',      icon: require('@/assets/share/Save.svg'),      action: 'save' },
  { id: 'stories',   label: 'Stories',   icon: require('@/assets/share/Stories.png'),   action: 'share', packageName: 'com.instagram.android' },
  { id: 'whatsapp',  label: 'WhatsApp',  icon: require('@/assets/share/WhatsApp.svg'),  action: 'share', packageName: 'com.whatsapp' },
  { id: 'snapchat',  label: 'Snapchat',  icon: require('@/assets/share/Snapchat.svg'),  action: 'share', packageName: 'com.snapchat.android' },
  { id: 'message',   label: 'Message',   icon: require('@/assets/share/Stories.png'),   action: 'share', packageName: 'com.instagram.android' },
  { id: 'x',         label: 'X',         icon: require('@/assets/share/X.svg'),         action: 'share', packageName: 'com.twitter.android' },
  { id: 'facebook',  label: 'Facebook',  icon: require('@/assets/share/Facebook.svg'),  action: 'share', packageName: 'com.facebook.katana' },
];

// ─── Layout constants (from screenshots) ─────────────────────────────────────

const { width: SW } = Dimensions.get('window');
// Sheet horizontal padding: 24dp each side
const SHEET_PAD_H = 24;
// Selector thumbnails: 33×60dp
const SELECTOR_W = 33;
const SELECTOR_H = 60;
// Card: fixed 182×322dp as per design spec
const CARD_WIDTH = 182;
const CARD_HEIGHT = 322;
// Text area inside card: top 48dp, bottom 70dp, left/right 16dp each
const QUOTE_AREA_HEIGHT = CARD_HEIGHT - 48 - 70; // 204dp
// Font scaling
const MAX_FONT_SIZE = 16;
const MIN_FONT_SIZE = 8;
// Max characters: at MIN_FONT_SIZE with widest font, ~20 chars/line × ~18 lines
export const MAX_SHARE_TEXT_LENGTH = 300;
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
  const isFontReady = (family: string) => fontsLoaded.has(family);

  const [patternIdx, setPatternIdx] = useState<PatternIndex>(0);
  const [colorIdx, setColorIdx]     = useState(0);
  const [fontIdx, setFontIdx]       = useState(0);
  const [capturing, setCapturing]   = useState(false);
  const [saved, setSaved]           = useState(false);
  const [quoteFontSize, setQuoteFontSize] = useState(MAX_FONT_SIZE);
  const fontSizeRef = useRef(MAX_FONT_SIZE);

  // ── Pill feedback ─────────────────────────────────────────────────────────
  const [pillText, setPillText]     = useState('');
  const [pillVisible, setPillVisible] = useState(false);
  const pillOpacity = useSharedValue(0);
  const pillTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showPill = useCallback((message: string) => {
    if (pillTimer.current) clearTimeout(pillTimer.current);
    setPillText(message);
    setPillVisible(true);
    pillOpacity.value = withTiming(1, { duration: 180 });
    pillTimer.current = setTimeout(() => {
      pillOpacity.value = withTiming(0, { duration: 280 }, () => {
        runOnJS(setPillVisible)(false);
      });
    }, 2200);
  }, []);

  const pillStyle = useAnimatedStyle(() => ({ opacity: pillOpacity.value }));

  // ── Text trimming ————————————————————————————————————————————————
  const rawText = selectedText || bookTitle;
  const isTrimmed = rawText.length > MAX_SHARE_TEXT_LENGTH;
  const displayText = isTrimmed
    ? rawText.slice(0, MAX_SHARE_TEXT_LENGTH - 1) + '…'
    : rawText;

  const cardRef = useRef<ViewShot>(null);

  // Reset saved state when sheet is closed
  useEffect(() => {
    if (!visible) setSaved(false);
  }, [visible]);

  // ── Sheet slide-up / drag-to-dismiss animation ──────────────────────────
  const translateY = useSharedValue(600);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.quad) });
      translateY.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
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

  // Pan gesture — drag down to dismiss, clamp upward drags
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 500) {
        // Dismiss: slide out then call onClose
        translateY.value = withTiming(700, { duration: 220, easing: Easing.bezier(0.32, 0, 0.67, 0) }, () => {
          runOnJS(onClose)();
        });
        backdropOpacity.value = withTiming(0, { duration: 200 });
      } else {
        // Snap back
        translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
      }
    });

  // ── Colour / pattern helpers ──────────────────────────────────────────────
  const currentColor = COLORS[colorIdx];
  const currentFont  = SHARE_FONTS[fontIdx % SHARE_FONTS.length];
  const patternSvg   = PATTERN_SVGS[patternIdx][currentColor.key];

  const prevPattern = () => setPatternIdx(i => ((i - 1 + 3) % 3) as PatternIndex);
  const nextPattern = () => setPatternIdx(i => ((i + 1) % 3) as PatternIndex);
  const prevFont    = () => setFontIdx(i => (i - 1 + SHARE_FONTS.length) % SHARE_FONTS.length);
  const nextFont    = () => setFontIdx(i => (i + 1) % SHARE_FONTS.length);

  // Reset font size whenever text or font changes so scaling re-runs from max
  useEffect(() => {
    fontSizeRef.current = MAX_FONT_SIZE;
    setQuoteFontSize(MAX_FONT_SIZE);
  }, [displayText, fontIdx]);

  // Iteratively shrink font until text fits the quote area
  const handleTextLayout = useCallback((e: { nativeEvent: { lines: Array<{ y: number; height: number }> } }) => {
    const lines = e.nativeEvent.lines;
    if (!lines.length) return;
    const lastLine = lines[lines.length - 1];
    const totalHeight = lastLine.y + lastLine.height;
    if (totalHeight > QUOTE_AREA_HEIGHT && fontSizeRef.current > MIN_FONT_SIZE) {
      const next = Math.max(MIN_FONT_SIZE, fontSizeRef.current - 1);
      fontSizeRef.current = next;
      setQuoteFontSize(next);
    }
  }, []);

  // Prev/next selector indices
  const prevIdx = ((patternIdx - 1 + 3) % 3) as PatternIndex;
  const nextIdx = ((patternIdx + 1) % 3) as PatternIndex;

  // ── Capture ───────────────────────────────────────────────────────────────
  const captureCard = useCallback(async (): Promise<string | null> => {
    try {
      if (!cardRef.current) return null;
      // @ts-ignore — capture is on the instance
      const uri: string = await cardRef.current.capture({ format: 'png', quality: 1, pixelRatio: 4 });
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
        showPill('Permission required');
        return;
      }
      const uri = await captureCard();
      if (!uri) return;
      await MediaLibrary.saveToLibraryAsync(uri);
      setSaved(true);
      showPill('Saved to gallery');
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
      if (!canShare) return;
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share quote' });
    } finally {
      setCapturing(false);
    }
  }, [capturing, captureCard, handleSave]);

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={StyleSheet.absoluteFillObject}>
      {/* ── Dimmed backdrop ──────────────────────────────────────────────── */}
      <Animated.View style={[StyleSheet.absoluteFillObject, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      {/* ── Sheet (wrapped in pan gesture for drag-to-dismiss) ───────────── */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }, sheetStyle]}>
          {/* Drag handle */}
          <View style={styles.handleWrap}>
            <Image source={DRAG_BAR_ICON} style={styles.handleImg} contentFit="contain" />
          </View>

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
            style={styles.card}
          >
            {/* Pattern fills card entirely */}
            <Image
              source={patternSvg}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
            />

            {/* Quote text — vertically centered between top padding and attribution */}
            <View style={styles.quoteArea}>
              <Text
                style={[
                  styles.quoteText,
                  { fontSize: quoteFontSize, lineHeight: quoteFontSize * 1.4 },
                  isFontReady(currentFont.fontFamily) ? { fontFamily: currentFont.fontFamily } : undefined,
                  currentFont.fontFamily === 'ShareFont-Manrope' ? { fontWeight: '700' } : undefined,
                ]}
                onTextLayout={handleTextLayout}
              >
                {displayText}
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
          <View style={styles.fontPreviewWrap}>
            <Text
              style={[
                styles.fontPreview,
                isFontReady(currentFont.fontFamily) ? { fontFamily: currentFont.fontFamily } : undefined,
                currentFont.fontFamily === 'ShareFont-Manrope' ? { fontWeight: '700' } : undefined,
              ]}
            >
              Abc
            </Text>
          </View>
          <Pressable onPress={nextFont} hitSlop={12} style={styles.fontArrow}>
            <Image
              source={require('@/assets/share/arrow-right.svg')}
              style={styles.arrowIcon}
              contentFit="contain"
            />
          </Pressable>
        </View>

        {/* ── Share destinations + pill overlay ───────────────────────── */}
        <View style={styles.shareRowWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.shareRow}
            style={styles.shareRowScroll}
          >
            {SHARE_DESTINATIONS.map((dest) => (
              <Pressable
                key={dest.id}
                style={styles.shareBtn}
                onPress={() => handleShare(dest)}
                disabled={capturing}
              >
                <Image
                  source={dest.icon}
                  style={[styles.shareIcon, dest.id === 'save' && saved && styles.shareIconSaved]}
                  contentFit="cover"
                />
                <Text style={[styles.shareLabel, dest.id === 'save' && saved && styles.shareLabelSaved]}>
                  {dest.id === 'save' && saved ? 'Saved' : dest.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {/* Pill feedback — overlays the share row */}
          {pillVisible && (
            <Animated.View style={[styles.pillOverlay, pillStyle]} pointerEvents="none">
              <View style={styles.pill}>
                <Text style={styles.pillText}>{pillText}</Text>
              </View>
            </Animated.View>
          )}
        </View>
        </Animated.View>
      </GestureDetector>
      </GestureHandlerRootView>
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
    bottom: 24,
    left: 12,
    right: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingTop: 12,
    paddingHorizontal: SHEET_PAD_H,
    gap: 32,
    zIndex: 1,
  },

  // Drag handle
  handleWrap: {
    alignSelf: 'center',
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handleImg: {
    width: 64,
    height: 12,
  },

  // Carousel
  carouselRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorWrap: {
    width: SELECTOR_W,
    height: SELECTOR_H,
    borderRadius: 6,
    overflow: 'hidden',
    opacity: 1.0,
  },
  selectorImg: {
    width: SELECTOR_W,
    height: SELECTOR_H,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 4,
    overflow: 'hidden',
    marginHorizontal: 16,
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
    width: '100%',
    color: '#FFFFFF',
    textAlign: 'center',
    // fontSize, lineHeight and fontWeight are set inline (dynamic per font)
  },
  attribution: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  coverThumb: {
    width: 14,
    height: 18,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  coverPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  attributionText: {
  },
  bookTitle: {
    color: '#FFFFFF',
    fontFamily: 'ShareFont-Manrope',
    fontSize: 6,
    fontWeight: '700',
  },
  bookAuthor: {
    color: '#ffffff',
    fontFamily: 'ShareFont-Manrope',
    fontSize: 6,
    fontWeight: '500',
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
  fontPreviewWrap: {
    alignItems: 'center',
    minWidth: 100,
  },
  fontPreview: {
    fontSize: 36,
    color: '#111111',
    lineHeight: 44,
  },
  fontName: {
    fontSize: 11,
    color: '#888888',
    marginTop: 2,
  },

  // Share row
  shareRowWrap: {
    position: 'relative',
    marginRight: -SHEET_PAD_H,
  },
  shareRowScroll: {
    flexGrow: 0,
  },
  shareRow: {
    paddingLeft: 0,
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
  shareIconSaved: {
    opacity: 0.35,
  },
  shareLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333333',
    textAlign: 'center',
  },
  shareLabelSaved: {
    color: '#555555',
  },

  // Pill feedback
  pillOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pill: {
    backgroundColor: '#F0F0F0',
    borderRadius: 100,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  pillText: {
    fontSize: 14,
    color: '#111111',
    fontWeight: '500',
  },
});
