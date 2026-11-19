/**
 * Largest font scale the home hero cards follow in a phone-sized window. A
 * phone's card is narrow: past this, a larger system font cuts its lines to a
 * few words and swells the badges until the last one is cut, instead of
 * making them easier to read. Android applies the scale as is; iOS takes the
 * Dynamic Type size whose captions come closest to it.
 */
export const HERO_CARD_MAX_FONT_SCALE = 1.3;

/**
 * Window width from which the hero cards follow the system's font scale. It is
 * where Material's compact width class ends, and a card this wide gives the
 * largest Android font scale (2.0) about the room per letter that a 411 wide
 * phone's card gives the cap.
 */
export const HERO_UNCAPPED_WINDOW_WIDTH = 600;
