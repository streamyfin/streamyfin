# A SwiftUI Host Stops Taking Taps While the Keyboard Is Up

**Date**: 2026-10-08
**Category**: ui
**Key files**: `components/PlatformDropdown.tsx`, `components/settings/QuickConnect.tsx`

## Detail

An `@expo/ui` `<Host>` honors the keyboard safe area by default. While a
keyboard is on screen, a small Host (a `Menu` the size of its trigger) keeps
drawing its content and stops responding to taps: the trigger looks normal and
the menu never opens. It does not matter where the Host is on screen, it was
nowhere near the keyboard when this was found.

`ignoreSafeArea='keyboard'` on the Host fixes it. `PlatformDropdown` sets it
for every dropdown, since a Host sized by an RN wrapper has no use for keyboard
avoidance.

Found on the Quick Connect sheet: the user picker sits above a code field that
takes focus as the sheet opens, so the picker was dead from the first frame.
Checked on the iOS 27 simulator with `@expo/ui` 57.0.21: the menu opened with
the keyboard down, never with it up, and again with the prop set. That the
safe area is the cause is inferred from the prop fixing it, the native layout
was not inspected.

## Symptom pattern

A dropdown that works everywhere else does nothing on one screen, and that
screen has a focused text input. Dismiss the keyboard and it works. Nothing is
logged, and Jest cannot show it: the SwiftUI views are mocked there.
