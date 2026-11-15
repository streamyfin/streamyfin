import {
  HERO_CARD_MAX_FONT_SCALE,
  HERO_UNCAPPED_WINDOW_WIDTH,
} from "@/constants/Hero";

/**
 * The largest font scale the hero cards follow in a window this wide, or null
 * when they follow the system's.
 */
export const heroCardMaxFontScale = (windowWidth: number): number | null =>
  windowWidth < HERO_UNCAPPED_WINDOW_WIDTH ? HERO_CARD_MAX_FONT_SCALE : null;
