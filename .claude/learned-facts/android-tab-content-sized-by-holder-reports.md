# Android Tab Screens Are Sized by What the Native Tab View Reports

**Date**: 2026-11-05
**Category**: navigation
**Key files**: `patches/react-native-bottom-tabs@1.4.0.patch` (`RCTTabView.kt`),
`node_modules/react-native-bottom-tabs/src/TabView.tsx`, `patches/react-native-bottom-tabs.test.ts`

## Detail

On Android, react-native-bottom-tabs gives every tab screen an explicit width and
height (`measuredDimensions` in `TabView.tsx`), taken from `onNativeLayout`
events that `ReactBottomNavigationView` sends with its content holder's size.
JS never measures the screens itself, so a stale report is a stale layout for
every tab at once.

Upstream only sent a report when the outer view changed size. Edge to edge
(Android 15+), a keyboard no longer shrinks the window: the Material
`BottomNavigationView` pads itself by the IME inset instead, so the holder
shrinks and grows while the outer view keeps its size. Logged on an Android 17
emulator with the keyboard up and then hidden:

```
outer=1080x2424 holder=1080x1330 bar=1094
outer=1080x2424 holder=1080x2150 bar=274
```

Neither change was reported. A report taken while a keyboard was showing (the
app opened from a keyboard search, upstream #1477) stuck after it closed: every
tab showed about half a screen until a rotation changed the outer size. Our
patch reports the holder's own size changes from a listener on the holder.

Reproducing needs a visible soft keyboard: an AVD with `hw.keyboard=yes`, or
agent-device's headless IME selected, never shows one. Select Gboard with
`adb shell ime set com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME`.

## Symptom pattern

Content of every tab cut off well above the tab bar, black below, the bar
itself fine; fixed by rotating the phone and back.
