# Native Bottom Tabs + useRouter Conflict

**Date**: 2025-01-09
**Category**: navigation
**Key files**: `providers/`, `app/_layout.tsx`

## Detail

When using `@bottom-tabs/react-navigation` with Expo Router, avoid using the `useRouter()` hook in components rendered at the provider level (outside the tab navigator). The hook subscribes to navigation state changes and can cause unexpected tab switches. Use the static `router` import from `expo-router` instead.

## Update (2026-11-10, expo-router 57)

`useRouter()` now returns the imperative `router` itself (`expo-router/build/hooks/useRouter.js` reads the preview
route context and nothing else), so it no longer follows the navigation state. `useAppRouter`, which CLAUDE.md
requires over the static import, is safe at the root: `JellyfinProvider` and `OutputPickerActions` hold it there.
Checked on Android and iOS: a Continue here started from the Search tab, its player closed, came back to the Search
tab.
