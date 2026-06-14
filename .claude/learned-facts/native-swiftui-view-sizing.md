# Native SwiftUI View Sizing

**Date**: 2026-01-25
**Category**: native-modules
**Key files**: `modules/`

## Detail

When creating Expo native modules with SwiftUI views, the view needs explicit dimensions. Use a `width` prop passed from React Native, set an explicit `.frame(width:height:)` in SwiftUI, and override `intrinsicContentSize` in the ExpoView wrapper to report the correct size to React Native's layout system. Using `.aspectRatio(contentMode: .fit)` alone causes inconsistent sizing.
