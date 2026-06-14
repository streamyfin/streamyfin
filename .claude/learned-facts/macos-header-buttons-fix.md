# macOS Header Buttons Fix

**Date**: 2026-01-10
**Category**: ui
**Key files**: `components/common/HeaderBackButton.tsx`, `app/(auth)/(tabs)/(home)/_layout.tsx`

## Detail

Header buttons (`headerRight`/`headerLeft`) don't respond to touches on macOS Catalyst builds when using standard React Native `TouchableOpacity`. Fix by using `Pressable` from `react-native-gesture-handler` instead. The library is already installed and `GestureHandlerRootView` wraps the app.
