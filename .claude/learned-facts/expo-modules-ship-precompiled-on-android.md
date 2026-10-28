# Expo modules ship precompiled on Android, so a patch to their Kotlin does nothing

**Date**: 2026-10-23
**Category**: build
**Key files**: `package.json` (`expo.autolinking.android.buildFromSource`), `patches/`, `patches/patches.test.ts`

## Detail

On SDK 57 (seen there; when it started was not checked) `expo-*` packages carry a prebuilt AAR in
`node_modules/<pkg>/local-maven-repo/`, declared as `android.publication` in
their `expo-module.config.json`. Autolinking links that AAR instead of
compiling `android/src`. A `bun patch` of the Kotlin sources applies cleanly,
Gradle builds, the app runs, and the old code is what ships: no warning
anywhere. The JS half of the same patch does apply, so the feature looks wired
up and just behaves as before (the external player chooser: `chooserTitle`
reached the module and was dropped, the intent went straight to the default
app).

To check what an APK contains: unzip its `classes*.dex` and `grep -a` for a
string the patch adds (a new field or param name).

Rules:

- A patch touching `android/` of an Expo module needs the package in
  `expo.autolinking.android.buildFromSource` in package.json. Each entry is a
  regex matched against the Gradle project name (the package name for expo
  modules). `patches/patches.test.ts` fails when one is missing.
- Gradle reads the setting at configuration time: no prebuild needed, but the
  native app must be rebuilt.
- iOS has the same mechanism (`expo.autolinking.ios.buildFromSource`, prebuilt
  XCFrameworks) for a patch to Swift sources.
