import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BukReadiumView,
  type BukReadyEvent,
  type BukLocationEvent,
  type BukTapEvent,
  type BukErrorEvent,
  type BukReadiumPreferences,
} from '@/modules/buk-readium';

// ─── Persistence keys ────────────────────────────────────────────────────────

function locatorKey(bookId: string) { return `readium-locator:${bookId}`; }
function progressKey(bookId: string) { return `progress-pct:${bookId}`; }

const PREFS_KEY = 'reader-prefs';

// ─── Theme presets ────────────────────────────────────────────────────────────

type ThemeId = 'night' | 'day' | 'sepia';

interface ThemeColors {
  bg:           string;
  text:         string;
  controlsBg:   string;
  border:       string;
  icon:         string;
  label:        string;
  accent:       string;
  panelBg:      string;
  panelText:    string;
  panelSubtext: string;
  pillActive:   string;
  pillActiveFg: string;
}

const THEMES: Record<ThemeId, ThemeColors> = {
  night: {
    bg:           '#1C1C1E',
    text:         '#ECEDEE',
    controlsBg:   'rgba(20, 20, 22, 0.94)',
    border:       'rgba(255, 255, 255, 0.10)',
    icon:         '#ECEDEE',
    label:        '#9BA1A6',
    accent:       '#5B9CF6',
    panelBg:      '#1A1A1C',
    panelText:    '#ECEDEE',
    panelSubtext: '#9BA1A6',
    pillActive:   '#5B9CF6',
    pillActiveFg: '#FFFFFF',
  },
  day: {
    bg:           '#FFFFFF',
    text:         '#1A1A1A',
    controlsBg:   'rgba(255, 255, 255, 0.96)',
    border:       'rgba(0, 0, 0, 0.08)',
    icon:         '#1A1A1A',
    label:        '#687076',
    accent:       '#0A7EA4',
    panelBg:      '#F2F2F7',
    panelText:    '#1A1A1A',
    panelSubtext: '#687076',
    pillActive:   '#0A7EA4',
    pillActiveFg: '#FFFFFF',
  },
  sepia: {
    bg:           '#F4EACB',
    text:         '#3B2A1A',
    controlsBg:   'rgba(244, 234, 203, 0.96)',
    border:       'rgba(59, 42, 26, 0.12)',
    icon:         '#3B2A1A',
    label:        '#7A6040',
    accent:       '#8B5E3C',
    panelBg:      '#EAD9B2',
    panelText:    '#3B2A1A',
    panelSubtext: '#7A6040',
    pillActive:   '#8B5E3C',
    pillActiveFg: '#FFFFFF',
  },
};

// ─── Reader preferences ───────────────────────────────────────────────────────

interface ReaderPrefs {
  themeId:    ThemeId;
  fontSize:   number;
  fontFamily: 'normal' | 'serif';
  lineHeight: number;
}

const DEFAULT_PREFS: ReaderPrefs = {
  themeId:    'night',
  fontSize:   1.0,
  fontFamily: 'normal',
  lineHeight: 1.8,
};

function prefsToReadium(p: ReaderPrefs): BukReadiumPreferences {
  const t = THEMES[p.themeId];
  return {
    backgroundColor: t.bg,
    textColor:       t.text,
    fontSize:        p.fontSize,
    fontFamily:      p.fontFamily === 'serif' ? 'serif' : undefined,
    lineHeight:      p.lineHeight,
  };
}

const PANEL_HEIGHT = 370;

export default function ReaderScreen() {
  const router = useRouter();
  const { bookId, title, fileUri } = useLocalSearchParams<{
    bookId?: string;
    title?: string;
    fileUri?: string;
  }>();
  const insets = useSafeAreaInsets();

  const resolvedBookId = bookId  ? String(bookId)  : '';
  const resolvedTitle  = title   ? String(title)    : 'Reader';
  const resolvedUri    = fileUri ? String(fileUri)  : '';

  // ─── State ─────────────────────────────────────────────────────────────────

  const [controlsVisible, setControlsVisible] = useState(true);
  const [savedLocator,    setSavedLocator]    = useState<string | null>(null);
  const [positionLoaded,  setPositionLoaded]  = useState(false);
  const [prefsLoaded,     setPrefsLoaded]     = useState(false);
  const [positionCount,   setPositionCount]   = useState(0);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [progression,     setProgression]     = useState(0);
  const [chapterTitle,    setChapterTitle]    = useState('');
  const [error,           setError]          = useState<string | null>(null);
  const [command,         setCommand]        = useState('');
  const [prefs,           setPrefs]          = useState<ReaderPrefs>(DEFAULT_PREFS);
  const [settingsOpen,    setSettingsOpen]   = useState(false);

  // ─── Reanimated — settings panel ─────────────────────────────────────────

  const panelY        = useSharedValue(PANEL_HEIGHT);
  const backdropAlpha = useSharedValue(0);

  const panelAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelY.value }],
  }));

  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: backdropAlpha.value,
  }));

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
    panelY.value        = withTiming(0,            { duration: 300, easing: Easing.out(Easing.cubic) });
    backdropAlpha.value = withTiming(1,            { duration: 250 });
  }, [panelY, backdropAlpha]);

  const doCloseSettings = useCallback(() => setSettingsOpen(false), []);

  const closeSettings = useCallback(() => {
    panelY.value        = withTiming(PANEL_HEIGHT, { duration: 250, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(doCloseSettings)();
    });
    backdropAlpha.value = withTiming(0,            { duration: 200 });
  }, [panelY, backdropAlpha, doCloseSettings]);

  // ─── Load locator + prefs in parallel ────────────────────────────────────

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const load = async () => {
      const [loc, savedPrefsJson] = await Promise.all([
        resolvedBookId
          ? AsyncStorage.getItem(locatorKey(resolvedBookId)).catch(() => null)
          : Promise.resolve(null),
        AsyncStorage.getItem(PREFS_KEY).catch(() => null),
      ]);
      setSavedLocator(loc);
      if (savedPrefsJson) {
        try { setPrefs((p) => ({ ...p, ...JSON.parse(savedPrefsJson) })); } catch {}
      }
      setPositionLoaded(true);
      setPrefsLoaded(true);
    };
    load();
  }, [resolvedBookId]);

  useEffect(() => () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
  }, []);

  // ─── Update preferences ──────────────────────────────────────────────────

  const updatePrefs = useCallback((patch: Partial<ReaderPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // ─── Event handlers ──────────────────────────────────────────────────────

  const handleReady = useCallback((event: BukReadyEvent) => {
    setPositionCount(event.nativeEvent.positionCount);
  }, []);

  const handleLocation = useCallback((event: BukLocationEvent) => {
    const { locator, position, positionCount: total, progression: prog } = event.nativeEvent;
    setCurrentPosition(position);
    setProgression(prog);
    if (total > 0) setPositionCount(total);

    try {
      const parsed = JSON.parse(locator);
      if (parsed?.title) setChapterTitle(String(parsed.title));
    } catch {}

    if (!resolvedBookId || !locator) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      AsyncStorage.setItem(locatorKey(resolvedBookId), locator).catch(() => {});
      AsyncStorage.setItem(progressKey(resolvedBookId), String(prog)).catch(() => {});
    }, 500);
  }, [resolvedBookId]);

  const handleTap = useCallback((_event: BukTapEvent) => {
    if (settingsOpen) { closeSettings(); return; }
    setControlsVisible((v) => !v);
  }, [settingsOpen, closeSettings]);

  const handleError = useCallback((event: BukErrorEvent) => {
    setError(event.nativeEvent.message);
  }, []);

  // ─── Derived ─────────────────────────────────────────────────────────────

  const isLoading = !positionLoaded || !prefsLoaded || !resolvedUri;
  const theme = THEMES[prefs.themeId];
  const readiumPrefs = JSON.stringify(prefsToReadium(prefs));
  const paginationText = positionCount > 0 ? `${currentPosition} / ${positionCount}` : '';

  // ─── Error screen ─────────────────────────────────────────────────────────

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }, styles.centered]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Feather name="alert-circle" size={40} color="#FF6B6B" />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={{ color: theme.label, marginTop: 16 }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Reader ───────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <View style={[StyleSheet.absoluteFillObject, styles.centered]}>
          <ActivityIndicator color={theme.label} size="large" />
        </View>
      ) : (
        <BukReadiumView
          style={StyleSheet.absoluteFillObject}
          src={resolvedUri}
          initialLocator={savedLocator ?? undefined}
          preferences={readiumPrefs}
          command={command}
          onBukReady={handleReady}
          onBukLocation={handleLocation}
          onBukTap={handleTap}
          onBukError={handleError}
        />
      )}

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      {controlsVisible && (
        <View
          style={[
            styles.header,
            {
              paddingTop: Math.max(insets.top, 14),
              backgroundColor: theme.controlsBg,
              borderBottomColor: theme.border,
            },
          ]}
        >
          <Pressable style={styles.iconBtn} onPress={() => router.back()}>
            <Feather name="chevron-left" size={24} color={theme.icon} />
          </Pressable>

          <Text style={[styles.headerTitle, { color: theme.icon }]} numberOfLines={1}>
            {resolvedTitle}
          </Text>

          <Pressable style={styles.iconBtn} onPress={openSettings}>
            <Feather name="sliders" size={19} color={theme.icon} />
          </Pressable>
        </View>
      )}

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      {controlsVisible && (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(insets.bottom, 10),
              backgroundColor: theme.controlsBg,
              borderTopColor: theme.border,
            },
          ]}
        >
          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${(progression * 100).toFixed(2)}%` as `${number}%`, backgroundColor: theme.accent },
              ]}
            />
          </View>

          <View style={styles.footerRow}>
            <Text style={[styles.footerChapter, { color: theme.label }]} numberOfLines={1}>
              {chapterTitle || resolvedTitle}
            </Text>
            {paginationText !== '' && (
              <Text style={[styles.footerPagination, { color: theme.label }]}>
                {paginationText}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* ── Settings backdrop + panel ─────────────────────────────────────────── */}
      {settingsOpen && (
        <>
          <Animated.View
            style={[StyleSheet.absoluteFillObject, styles.backdrop, backdropAnimStyle]}
          >
            <Pressable style={StyleSheet.absoluteFillObject} onPress={closeSettings} />
          </Animated.View>

          <Animated.View
            style={[
              styles.panel,
              { backgroundColor: theme.panelBg, paddingBottom: Math.max(insets.bottom, 20) },
              panelAnimStyle,
            ]}
          >
            {/* Handle */}
            <View style={[styles.panelHandle, { backgroundColor: theme.border }]} />

            {/* ── Appearance ─────────────────────────────────────────────────── */}
            <Text style={[styles.sectionTitle, { color: theme.panelSubtext }]}>APPEARANCE</Text>
            <View style={styles.pillRow}>
              {(['night', 'day', 'sepia'] as ThemeId[]).map((id) => (
                <Pressable
                  key={id}
                  style={[
                    styles.pill,
                    prefs.themeId === id
                      ? { backgroundColor: theme.pillActive }
                      : { backgroundColor: THEMES[id].bg, borderColor: theme.border, borderWidth: 1 },
                  ]}
                  onPress={() => updatePrefs({ themeId: id })}
                >
                  <Text
                    style={[
                      styles.pillText,
                      { color: prefs.themeId === id ? theme.pillActiveFg : THEMES[id].text },
                    ]}
                  >
                    {id === 'night' ? 'Night' : id === 'day' ? 'Day' : 'Sepia'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* ── Font size ──────────────────────────────────────────────────── */}
            <Text style={[styles.sectionTitle, { color: theme.panelSubtext }]}>FONT SIZE</Text>
            <View style={styles.stepRow}>
              <Pressable
                style={[styles.stepBtn, { borderColor: theme.border }]}
                onPress={() =>
                  updatePrefs({ fontSize: Math.max(0.8, +(prefs.fontSize - 0.1).toFixed(1)) })
                }
              >
                <Feather name="minus" size={18} color={theme.icon} />
              </Pressable>
              <Text style={[styles.stepValue, { color: theme.panelText }]}>
                {prefs.fontSize.toFixed(1)}×
              </Text>
              <Pressable
                style={[styles.stepBtn, { borderColor: theme.border }]}
                onPress={() =>
                  updatePrefs({ fontSize: Math.min(2.0, +(prefs.fontSize + 0.1).toFixed(1)) })
                }
              >
                <Feather name="plus" size={18} color={theme.icon} />
              </Pressable>
            </View>

            {/* ── Font family ────────────────────────────────────────────────── */}
            <Text style={[styles.sectionTitle, { color: theme.panelSubtext }]}>FONT</Text>
            <View style={styles.pillRow}>
              {(['normal', 'serif'] as const).map((fam) => (
                <Pressable
                  key={fam}
                  style={[
                    styles.pill,
                    prefs.fontFamily === fam
                      ? { backgroundColor: theme.pillActive }
                      : { backgroundColor: 'transparent', borderColor: theme.border, borderWidth: 1 },
                  ]}
                  onPress={() => updatePrefs({ fontFamily: fam })}
                >
                  <Text
                    style={[
                      styles.pillText,
                      {
                        color: prefs.fontFamily === fam ? theme.pillActiveFg : theme.panelText,
                        fontFamily: fam === 'serif' ? 'serif' : undefined,
                      },
                    ]}
                  >
                    {fam === 'serif' ? 'Serif' : 'Default'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* ── Line height ────────────────────────────────────────────────── */}
            <Text style={[styles.sectionTitle, { color: theme.panelSubtext }]}>LINE SPACING</Text>
            <View style={styles.pillRow}>
              {([
                { label: 'Compact', value: 1.4 },
                { label: 'Normal',  value: 1.8 },
                { label: 'Relaxed', value: 2.2 },
              ] as const).map(({ label, value }) => (
                <Pressable
                  key={label}
                  style={[
                    styles.pill,
                    prefs.lineHeight === value
                      ? { backgroundColor: theme.pillActive }
                      : { backgroundColor: 'transparent', borderColor: theme.border, borderWidth: 1 },
                  ]}
                  onPress={() => updatePrefs({ lineHeight: value })}
                >
                  <Text
                    style={[
                      styles.pillText,
                      { color: prefs.lineHeight === value ? theme.pillActiveFg : theme.panelText },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 4,
  },

  // ── Footer ──────────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    zIndex: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  progressTrack: {
    height: 3,
    width: '100%',
  },
  progressFill: {
    height: 3,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  footerChapter: {
    flex: 1,
    fontSize: 12,
    marginRight: 12,
  },
  footerPagination: {
    fontSize: 12,
  },

  // ── Backdrop ─────────────────────────────────────────────────────────────────
  backdrop: {
    zIndex: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.50)',
  },

  // ── Settings panel ───────────────────────────────────────────────────────────
  panel: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    zIndex: 30,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 12,
    paddingHorizontal: 20,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.30,
    shadowRadius: 16,
  },
  panelHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 22,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.9,
    marginBottom: 10,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 22,
  },
  pill: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepValue: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '500',
  },

  // ── Error ────────────────────────────────────────────────────────────────────
  backButton: {
    padding: 8,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 12,
  },
});

