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
