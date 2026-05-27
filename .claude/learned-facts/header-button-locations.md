# Header Button Locations

**Date**: 2026-01-10
**Category**: ui
**Key files**: `app/(auth)/(tabs)/(home)/_layout.tsx`, `components/common/HeaderBackButton.tsx`, `components/Chromecast.tsx`, `components/RoundButton.tsx`, `components/home/Home.tsx`, `app/(auth)/(tabs)/(home)/downloads/index.tsx`

## Detail

Header buttons are defined in multiple places: `app/(auth)/(tabs)/(home)/_layout.tsx` (SettingsButton, SessionsButton, back buttons), `components/common/HeaderBackButton.tsx` (reusable), `components/Chromecast.tsx`, `components/RoundButton.tsx`, and dynamically via `navigation.setOptions()` in `components/home/Home.tsx` and `app/(auth)/(tabs)/(home)/downloads/index.tsx`.
