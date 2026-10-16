# Sentry Native Options Fail Silently

**Date**: 2026-10-04
**Category**: native-modules
**Key files**: `utils/sentry.ts` (`NATIVE_SDK_OPTIONS`), `utils/sentry.test.ts`

## Detail

`Sentry.init` hands its whole options object to sentry-cocoa, which reads it
key by key in `Sources/Swift/Options+Dictionary.swift`. A key that file does
not know is ignored: no error, no warning, no log line. The TypeScript surface
of `@sentry/react-native` does not declare most of these native keys, so the
cast in `NATIVE_SDK_OPTIONS` hides a misspelling from the compiler as well.

That is how `enableReportNonFullyBlockedAppHangs: false` shipped and changed
nothing. The option is `enableReportNonFullyBlockingAppHangs`: "Blocking",
although the events it silences are titled "App Hang Non Fully Blocked".

Before adding a native key, look it up in `Options+Dictionary.swift` at the
sentry-cocoa version pinned in `node_modules/@sentry/react-native/RNSentry.podspec`
(`sentry_cocoa_version`), and check the `#if` around it: some keys are read on
iOS and tvOS only.

JS `beforeSend` does not run for events the native SDK sends (app hangs,
native crashes, watchdog terminations), so a native option is the only place
those can be switched off.

## Symptom pattern

A class of native events keeps arriving from a build that is known to carry
the option that should have stopped it.
