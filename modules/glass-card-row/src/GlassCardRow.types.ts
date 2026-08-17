import type { StyleProp, ViewStyle } from "react-native";

/** One card. Everything is prebuilt in JS — the native view is presentational. */
export interface GlassCardRowItem {
  /** Item id, handed back by `onItemPress` / `onItemLongPress`. */
  id: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  /** Watch progress in 0...1. Draws the progress bar when > 0. */
  progress?: number;
  /** Unwatched movie or episode — draws the accent dot. */
  unwatched?: boolean;
  /** Episodes left on a series/box set — draws the count badge when > 0. */
  unplayedCount?: number;
  /** Faded back because another card in the row is the current one. */
  dimmed?: boolean;
}

/** Card geometry. JS owns it because it also reserves the row height in RN. */
export interface GlassCardRowLayout {
  /** Card width in points. Default: 220. */
  cardWidth?: number;
  /** width / height of the artwork. Default: 16 / 9. */
  aspectRatio?: number;
  /** Default: 14. */
  cornerRadius?: number;
  /** Gap between cards. Default: 10. */
  spacing?: number;
  /** Leading/trailing inset of the row content. Default: 16. */
  contentInset?: number;
  /**
   * Share of the card the frosted band covers, bottom up. Default: 0.45 — a
   * tall portrait poster wants less than a landscape still for the same text.
   */
  frostFraction?: number;
  /**
   * Breathing room above/below the cards so the drop shadow isn't clipped.
   * Default: `GLASS_CARD_ROW_VERTICAL_PADDING`. Sent rather than hardcoded
   * natively so JS stays the single source of the row's height.
   */
  verticalPadding?: number;
}

/** The grid takes the same cards and geometry; only the container differs. */
export interface GlassCardGridViewProps {
  items: GlassCardRowItem[];
  imageHeaders?: Record<string, string>;
  layout?: GlassCardRowLayout;
  /** Cards per row. Default: 3. */
  columns?: number;
  loadingMore?: boolean;
  /** Room at the top of the scroll content, for safe areas and pinned UI. */
  contentInsetTop?: number;
  contentInsetBottom?: number;
  /** Changing this scrolls back to the top — the list changed underneath. */
  scrollToTopToken?: string | null;
  onItemPress?: (event: { nativeEvent: { id: string; index: number } }) => void;
  onItemLongPress?: (event: {
    nativeEvent: { id: string; index: number };
  }) => void;
  onEndReached?: () => void;
  style?: StyleProp<ViewStyle>;
}

export interface GlassCardRowViewProps {
  items: GlassCardRowItem[];
  /** Custom proxy auth headers for the image host, if any are configured. */
  imageHeaders?: Record<string, string>;
  layout?: GlassCardRowLayout;
  /** Shows a spinner after the last card while the next page loads. */
  loadingMore?: boolean;
  /**
   * Card to bring into view. Applied when the value changes, so it never
   * fights the user's own scrolling on unrelated re-renders.
   */
  scrollToId?: string | null;
  onItemPress?: (event: { nativeEvent: { id: string; index: number } }) => void;
  onItemLongPress?: (event: {
    nativeEvent: { id: string; index: number };
  }) => void;
  /** Fired when the tail of the row scrolls into view. */
  onEndReached?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Vertical padding the native row adds around the cards so their drop shadow
 * isn't clipped. Mirrors `GlassCardRowMetrics.verticalPadding` in Swift; add it
 * to the card height when sizing the row.
 */
export const GLASS_CARD_ROW_VERTICAL_PADDING = 6;

/** Height the row needs for a given card width and aspect ratio. */
export function glassCardRowHeight(
  cardWidth: number,
  aspectRatio: number,
): number {
  return cardWidth / aspectRatio + GLASS_CARD_ROW_VERTICAL_PADDING * 2;
}
