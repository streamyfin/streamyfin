import { Platform } from "react-native";

export const TAB_HEIGHT = Platform.OS === "android" ? 58 : 74;

// Matches `w-28` poster cards (approx 112px wide, 10/15 aspect ratio) + 2 lines of text.
export const POSTER_CAROUSEL_HEIGHT = 220;

// Bottom sheets size themselves to their content and stop here, as a share of
// the window height. The ceiling keeps the page visible behind a long list,
// which is what tells the user the sheet is a layer and not a new screen.
export const SHEET_MAX_HEIGHT_RATIO = 0.85;

/** A poster's width over its height, as TMDB's artwork is cut. */
export const POSTER_ASPECT_RATIO = 10 / 15;

/**
 * How far a TV page's content sits in from the screen edges. Deliberately not
 * scaled: `scaleSize` halves it on a 960-wide Android TV, which left a page
 * built with it out of line with its neighbours. Not `TVPadding.horizontal`
 * either, which follows the native search bar's inset. Kept here rather than
 * in `TVSizes.ts`, which reads the settings atom: a plain number should not
 * pull that into every page that imports it.
 */
export const TV_HORIZONTAL_PADDING = 60;
