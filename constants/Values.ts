import { Platform } from "react-native";

export const TAB_HEIGHT = Platform.OS === "android" ? 58 : 74;

// Matches `w-28` poster cards (approx 112px wide, 10/15 aspect ratio) + 2 lines of text.
export const POSTER_CAROUSEL_HEIGHT = 220;

// Bottom sheets size themselves to their content and stop here, as a share of
// the window height. The ceiling keeps the page visible behind a long list,
// which is what tells the user the sheet is a layer and not a new screen.
export const SHEET_MAX_HEIGHT_RATIO = 0.85;
