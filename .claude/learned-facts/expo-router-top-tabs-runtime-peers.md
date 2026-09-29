# Expo Router's top tabs need react-native-tab-view even though nothing imports it

**Date**: 2026-09-27
**Category**: navigation
**Key files**: `app/(auth)/(tabs)/(home,libraries,search,favorites,watchlists)/livetv/_layout.tsx`, `app/(auth)/(tabs)/(libraries)/music/[libraryId]/_layout.tsx`, `package.json`

## Detail

The Live TV and music layouts build their top tabs from `expo-router/js-top-tabs`, which
vendors the material top tabs navigator. The vendored view loads `react-native-tab-view`
with a `require` inside a `try`/`catch` at module scope, and `react-native-tab-view` in turn
needs `react-native-pager-view`. Neither package appears in any `import` in the app, so a
scan for unused dependencies flags both.

Removing them passes the typecheck, the unit tests and `expo export`, because Metro treats
that `require` as optional. The app then crashes on launch, as soon as expo-router loads the
layouts: "Install the 'react-native-tab-view' package and its peer dependencies to use the
Expo Router's TopTabs". Keep both packages as long as a layout uses `expo-router/js-top-tabs`,
and launch a real build before trusting any dependency removal.

`@react-navigation/material-top-tabs` itself is not needed: the vendored copy replaces it.
