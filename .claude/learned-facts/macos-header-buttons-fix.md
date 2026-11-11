# macOS Header Buttons Fix

**Date**: 2026-01-10
**Category**: ui
**Key files**: `components/common/HeaderButton.tsx`, `components/RoundButton.tsx`, `app/(auth)/(tabs)/(home)/_layout.tsx`

## Detail

Header buttons (`headerRight`/`headerLeft`) don't respond to touches on macOS Catalyst builds when using standard React Native `TouchableOpacity`. Fix by using `LegacyPressable` from `react-native-gesture-handler` instead. The library is already installed and `GestureHandlerRootView` wraps the app.

Gesture Handler 3 renamed its 2.x `Pressable` to `LegacyPressable` and gave the `Pressable` name to a new component. The fix relies on the legacy one's native press handling, and so does the responder claim in `RoundButton`, so import `LegacyPressable` (aliased to `Pressable` in `HeaderButton` and `RoundButton`), not the new `Pressable`.
