# An Android Alert asked for while the activity is paused is lost

**Date**: 2026-11-10
**Category**: ui
**Key files**: `components/cast/CastFailureNotice.tsx`, `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/dialog/DialogModule.kt`

## Detail

React Native's Android `DialogModule` shows an alert at once only while the host activity is in the foreground.
Otherwise it keeps the `AlertFragment` on a `FragmentManagerHelper` it builds for that one call, and `onHostResume`
builds a new helper, whose pending alert is null: the alert never shows, and nothing reports it.

Anything that pauses `MainActivity` does it: the Cast SDK's expanded controls (`CastExpandedControllerActivity`, an
activity of its own), a system dialog, the app in the background. `AppState` reads `"background"` meanwhile.

An alert that answers an event rather than a tap (a receiver's status, a socket message) waits for `AppState` to be
`"active"` before `Alert.alert`, as `CastFailureNotice` does with `onAppForeground`, and weighs again then whether it
still applies.

Seen on 2026-11-10: the receiver failed 2 s after its load answer, with the expanded controls up, and the alert asked
for then never appeared; the same failure with the app already back showed it.
