# Stack Screen Header Configuration

**Date**: 2026-01-10
**Category**: ui
**Key files**: `app/(auth)/(tabs)/(home)/_layout.tsx`

## Detail

Sub-pages under `(home)` need explicit `Stack.Screen` entries in `app/(auth)/(tabs)/(home)/_layout.tsx` with `headerTransparent: Platform.OS === "ios"`, `headerBlurEffect: "none"`, and a back button. Without this, pages show with wrong header styling.
