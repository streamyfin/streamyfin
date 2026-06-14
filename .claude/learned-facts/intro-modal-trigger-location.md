# Intro Modal Trigger Location

**Date**: 2025-01-09
**Category**: navigation
**Key files**: `components/home/Home.tsx`, `app/(auth)/(tabs)/_layout.tsx`

## Detail

The intro modal trigger logic should be in the `Home.tsx` component, not in the tabs `_layout.tsx`. Triggering modals from tab layout can interfere with native bottom tabs navigation.
