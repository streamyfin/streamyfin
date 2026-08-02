import { NativeWindStyleSheet } from "nativewind";

/**
 * Make NativeWind emit style objects on web instead of class names.
 *
 * NativeWind v2 defaults web output to "css": it passes the raw Tailwind class
 * names (`bg-neutral-900`, `text-3xl`, …) straight through to the DOM and
 * assumes a compiled Tailwind stylesheet is on the page to back them. An Expo
 * web export never produces that stylesheet, so every class lands unmatched and
 * the app renders completely unstyled.
 *
 * "native" resolves the same classes to React Native style objects, which
 * react-native-web renders directly — so the desktop build gets pixel-identical
 * styling to mobile with no CSS build step.
 *
 * Imported first from index.ts: ES modules evaluate in declaration order, so
 * this runs before expo-router mounts anything styled.
 */
NativeWindStyleSheet.setOutput({ web: "native" });
