# Native Bottom Tabs + useRouter Conflict

**Date**: 2025-01-09, updated 2026-11-10 (expo-router 57)
**Category**: navigation
**Key files**: `providers/`, `app/_layout.tsx`, `hooks/useAppRouter.ts`

## Detail

With `@bottom-tabs/react-navigation`, an older Expo Router's `useRouter()` in a component rendered at the provider
level (outside the tab navigator) subscribed to navigation state changes and could cause unexpected tab switches.
The workaround then was the static `router` import.

Since expo-router 57, `useRouter()` returns the imperative `router` itself (`expo-router/build/hooks/useRouter.js`
reads the preview route context and nothing else), so it follows no navigation state. Use `useAppRouter` at the root
as everywhere else: CLAUDE.md forbids the static import, which loses the offline state across navigation.
`JellyfinProvider` and `OutputPickerActions` hold it there. Checked on Android and iOS: a Continue here started from
the Search tab, its player closed, came back to the Search tab.
