import type { StyleProp, ViewStyle } from "react-native";

export type HeroCarouselItem = {
  id: string;
  title: string;
  /** Secondary line under the title, e.g. "S2E5 · Episode name". */
  subtitle?: string | null;
  overview: string;
  /** Pre-localized chip text on the card, e.g. "Continue watching". */
  label?: string | null;
  /** SF Symbol name rendered in the chip, e.g. "play.fill". */
  labelIcon?: string | null;
  backdropUrl?: string | null;
  logoUrl?: string | null;
  posterUrl?: string | null;
  /** Pre-localized badge strings (year, official rating, runtime, ...). */
  badges: string[];
  communityRating?: number | null;
  /** Watch progress in 0–1; renders a progress bar when > 0. */
  progress?: number | null;
};

/** One row in the filter menu. */
export type HeroCarouselFilterOption = {
  /** Stable identifier echoed back by `onFilterToggle`. */
  key: string;
  /** Pre-localized row title. */
  label: string;
  /** Whether the row shows a checkmark. Ignored when `destructive`. */
  enabled: boolean;
  /**
   * Render as a red destructive action instead of a checkmark toggle, for a
   * row that performs a one-way action rather than flipping a filter.
   */
  destructive?: boolean;
};

/** A group of rows in the filter menu. */
export type HeroCarouselFilterSection = {
  /** Stable identity for the group. */
  key: string;
  /** Pre-localized header; omit for an untitled group (just a divider). */
  title?: string | null;
  options: HeroCarouselFilterOption[];
};

export type HeroCarouselItemPressEvent = {
  id: string;
};

export type HeroCarouselFilterToggleEvent = {
  key: string;
};

export type HeroCarouselViewProps = {
  items: HeroCarouselItem[];
  /** Custom proxy auth headers attached to every image request. */
  imageHeaders?: Record<string, string>;
  /**
   * Rows for the filter menu behind the button in the card's top-right
   * corner. Omit (or pass an empty array) to hide the button entirely.
   */
  filterSections?: HeroCarouselFilterSection[];
  /** Pre-localized accessibility label for the filter button. */
  filterLabel?: string;
  onItemPress?: (event: { nativeEvent: HeroCarouselItemPressEvent }) => void;
  /** Fires with the toggled row's `key`; the caller owns the new state. */
  onFilterToggle?: (event: {
    nativeEvent: HeroCarouselFilterToggleEvent;
  }) => void;
  style?: StyleProp<ViewStyle>;
};
