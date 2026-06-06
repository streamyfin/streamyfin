# Native Bottom Tabs + useRouter Conflict

**Date**: 2025-01-09
**Category**: navigation
**Key files**: `providers/`, `app/_layout.tsx`

## Detail

When using `@bottom-tabs/react-navigation` with Expo Router, avoid using the `useRouter()` hook in components rendered at the provider level (outside the tab navigator). The hook subscribes to navigation state changes and can cause unexpected tab switches. Use the static `router` import from `expo-router` instead.
