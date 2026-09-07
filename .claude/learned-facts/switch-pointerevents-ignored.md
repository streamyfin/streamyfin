# Switch Ignores Its Own pointerEvents

**Date**: 2026-08-31
**Category**: ui
**Key files**: `components/IntroSheet.tsx`, `components/common/SettingSwitch.tsx`

## Detail

`<Switch pointerEvents="none">` does not make a React Native Switch inert on
Android (and is unreliable on iOS): the native control consumes its own taps,
flips visually, and the controlled `value` prop snaps it straight back. The
user sees a toggle that can be tapped but never changes.

Make a presentational switch inert by wrapping it in a `View
pointerEvents="none"` — a parent View does honor the prop, so the tap falls
through to the wrapping pressable (IntroSheet's crash-report row relies on
this: the row's TouchableOpacity is the single mutation path). Setting the
prop directly on the Switch is why the intro crash-report toggle ignored taps
on the switch itself while taps on the row text worked.

## Symptom pattern

One switch "can't be toggled" while every other switch in the app works. The
working ones wire `onValueChange` directly; the broken one relies on
`pointerEvents` on the Switch plus a row-level press handler.
