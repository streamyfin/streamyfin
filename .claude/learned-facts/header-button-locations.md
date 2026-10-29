# Header Button Locations

**Date**: 2026-01-10, corrected 2026-10-29
**Category**: ui
**Key files**: `app/(auth)/(tabs)/(home)/_layout.tsx`, `components/common/HeaderBackButton.tsx`, `components/Chromecast.tsx`, `components/RoundButton.tsx`, `components/home/Home.tsx`, `app/(auth)/(tabs)/(home,more)/downloads/index.tsx`

## Detail

Header buttons are defined in multiple places: `app/(auth)/(tabs)/(home)/_layout.tsx` (Cast and SyncPlay; Sessions and Settings are rows of the More menu, `components/more/MoreMenu.tsx`), `components/common/HeaderBackButton.tsx` (reusable), `components/Chromecast.tsx`, `components/RoundButton.tsx`, and dynamically via `navigation.setOptions()` in `components/home/Home.tsx` and `app/(auth)/(tabs)/(home,more)/downloads/index.tsx`.
