import { requireNativeModule, requireNativeViewManager } from 'expo-modules-core';
import type { StyleProp, ViewStyle } from 'react-native';

// ─── Event types ──────────────────────────────────────────────────────────────

export interface BukReadyEvent {
  nativeEvent: {
    /** Total number of positions (Readium's stable page equivalent) in the publication */
    positionCount: number;
  };
}

export interface BukLocationEvent {
  nativeEvent: {
    /** Serialised Readium Locator JSON — pass back to `initialLocator` to restore position */
    locator: string;
    /** Current position index (1-based) */
    position: number;
    /** Total positions */
    positionCount: number;
    /** Overall progression 0.0–1.0 */
    progression: number;
  };
}

export interface BukTapEvent {
  nativeEvent: {
    /** Tap X in logical dp */
    x: number;
    /** Tap Y in logical dp */
    y: number;
  };
}

export interface BukErrorEvent {
  nativeEvent: {
    message: string;
  };
}

export interface BukSelectionEvent {
  nativeEvent: {
    selectedText: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface BukHighlightTapEvent {
  nativeEvent: {
    id: string;
    colorHex: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface BukHighlightAppliedEvent {
  nativeEvent: {
    id: string;
    locatorJson: string;
    colorHex: string;
  };
}

export interface HighlightEntry {
  id: string;
  locatorJson: string;
  colorHex: string;
  createdAt: number;
}

// ─── Command type ─────────────────────────────────────────────────────────────

export type BukReadiumCommandType = 'next' | 'prev' | 'goto' | 'gotoProgression' | 'gotoPosition';

export interface BukReadiumCommand {
  /** Monotonically increasing id — native side deduplicates by id */
  id: number;
  type: BukReadiumCommandType;
  /** Serialised Readium Locator JSON — only required for type 'goto' */
  locator?: string;
  /** Total progression 0.0–1.0 — only for 'gotoProgression' */
  progression?: number;
  /** 1-based position index — only for 'gotoPosition' */
  position?: number;
}

/** Build a navigation command string ready for the `command` prop */
let _commandCounter = 0;
export function buildCommand(type: BukReadiumCommandType, locatorOrProgression?: string | number): string {
  const id = ++_commandCounter;
  if (type === 'gotoProgression' && typeof locatorOrProgression === 'number') {
    return JSON.stringify({ id, type, progression: locatorOrProgression } satisfies BukReadiumCommand);
  }
  if (type === 'gotoPosition' && typeof locatorOrProgression === 'number') {
    return JSON.stringify({ id, type, position: locatorOrProgression } satisfies BukReadiumCommand);
  }
  return JSON.stringify({ id, type, locator: locatorOrProgression as string } satisfies BukReadiumCommand);
}

// ─── Preferences type ─────────────────────────────────────────────────────────

export interface BukReadiumPreferences {
  /** CSS colour string, e.g. '#222222' */
  backgroundColor?: string;
  /** CSS colour string, e.g. '#ECEDEE' */
  textColor?: string;
  /** Font size multiplier, e.g. 1.2 for 120% */
  fontSize?: number;
  /** Font family name */
  fontFamily?: string;
  /** Line height multiplier */
  lineHeight?: number;
  /** 'auto' | 'ltr' | 'rtl' */
  readingProgression?: 'auto' | 'ltr' | 'rtl';
}

// ─── View props ───────────────────────────────────────────────────────────────

export interface BukReadiumViewProps {
  style?: StyleProp<ViewStyle>;

  /**
   * Absolute `file://` path (or `content://` URI) of the publication to open.
   * Changing this prop opens a new publication.
   */
  src?: string;

  /**
   * Serialised Readium `Locator` JSON to restore a saved reading position.
   * Must be set before (or simultaneously with) `src`.
   */
  initialLocator?: string;

  /**
   * Serialised `BukReadiumPreferences` JSON.
   * Applied live — navigator re-renders in place.
   */
  preferences?: string;

  /**
   * Serialised `BukReadiumCommand` JSON.
   * Bump `id` for repeated same-type commands.
   */
  command?: string;

  /** Fired once when the publication is opened and positions are ready */
  onBukReady?: (event: BukReadyEvent) => void;

  /** Fired on every page turn or programmatic navigation */
  onBukLocation?: (event: BukLocationEvent) => void;

  /** Fired on a tap that the navigator did not consume */
  onBukTap?: (event: BukTapEvent) => void;

  /** Fired on any error opening or rendering the publication */
  onBukError?: (event: BukErrorEvent) => void;

  /** Fired when text is selected (selectedText empty = cleared) */
  onBukSelection?: (event: BukSelectionEvent) => void;

  /** Fired when the user taps an existing highlight */
  onBukHighlightTap?: (event: BukHighlightTapEvent) => void;

  /** Fired after a highlight is applied natively (returns authoritative locator) */
  onBukHighlightApplied?: (event: BukHighlightAppliedEvent) => void;

  /** Serialised highlight command JSON: {action, id, colorHex?, highlights?} */
  highlightCommand?: string;
}

// Module name must match Name("BukReadium") in BukReadiumModule.kt
const NativeBukReadium = requireNativeModule('BukReadium');
const BukReadiumView = requireNativeViewManager<BukReadiumViewProps>('BukReadium');

export interface EpubMetadata {
  title?: string;
  authors?: string;
  publisher?: string;
  description?: string;
  language?: string;
  identifier?: string;
  series?: string;
  published?: string;
}

export interface EpubTocItem {
  title: string;
  href: string;
  locator?: string;
}

export interface EpubSearchResult {
  /** Serialised Readium Locator JSON — pass to setPendingNavigation to navigate */
  locator: string;
  /** Surrounding text with the match in the middle */
  snippet: string;
  /** Title of the chapter/section containing the match */
  chapterTitle: string;
}

/**
 * Extract the cover image from an EPUB file.
 * Returns a `file://` URI to a cached JPEG, or `null` if no cover is found.
 */
export async function extractEpubCover(src: string): Promise<string | null> {
  return NativeBukReadium.extractEpubCover(src);
}

export async function extractEpubMetadata(src: string): Promise<EpubMetadata | null> {
  return NativeBukReadium.extractEpubMetadata(src);
}

export async function extractEpubToc(src: string): Promise<EpubTocItem[] | null> {
  return NativeBukReadium.extractEpubToc(src);
}

export async function searchEpub(src: string, query: string): Promise<EpubSearchResult[]> {
  return NativeBukReadium.searchEpub(src, query);
}

export { BukReadiumView };
