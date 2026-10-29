import type { ImageTransition } from "expo-image";
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
 * MMKV key for the collection type and server of each hidden singleton view
 * (Live TV, Collections, Playlists), which is what carries a hidden view over
 * when Jellyfin 12 changes its id.
 */
export const HIDDEN_LIBRARY_ORIGINS_STORAGE_KEY = "hiddenLibraryOrigins";

/**
 * Duration of the transition animation for poster cards, in milliseconds.
 */
export const POSTER_IMAGE_TRANSITION_DURATION = 150;

/**
 * Duration of the transition animation for background images, in milliseconds.
 */
export const BACKGROUND_IMAGE_TRANSITION_DURATION = 300;

// The fade plays when an image arrives from the network. One already cached
// shows at once, so a page opened again or a card scrolled back into view does
// not fade in a second time.
export const POSTER_IMAGE_TRANSITION: ImageTransition = {
  duration: POSTER_IMAGE_TRANSITION_DURATION,
  skipOnCacheHit: "all",
};

export const BACKGROUND_IMAGE_TRANSITION: ImageTransition = {
  duration: BACKGROUND_IMAGE_TRANSITION_DURATION,
  skipOnCacheHit: "all",
};
