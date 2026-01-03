import { Platform } from "react-native";

export const TAB_HEIGHT = Platform.OS === "android" ? 58 : 74;

// Matches `w-28` poster cards (approx 112px wide, 10/15 aspect ratio) + 2 lines of text.
export const POSTER_CAROUSEL_HEIGHT = 220;
