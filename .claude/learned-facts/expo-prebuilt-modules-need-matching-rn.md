# Expo Prebuilt Modules Need The Matching React Native

**Date**: 2026-11-11
**Category**: build-and-tooling
**Key files**: `package.json` (`expo`, `react-native`), `node_modules/expo/bundledNativeModules.json`

## Detail

With SDK 58, `pod install` downloads ExpoModulesCore as a prebuilt
`ExpoModulesCore.xcframework` instead of compiling it. Expo builds that binary
against the upstream React Native patch the SDK targets, which
`expo/bundledNativeModules.json` names (`"react-native": "0.88.1"` for every
SDK 58 patch so far). The binary finds the React core classes it uses by name
when the app loads. Nothing checks them at build time: the app compiles and
links, and a missing class only shows up when dyld loads it.

expo-modules-core 58.0.30 added `ExpoRootViewController`, which reads
`RCTStatusBarAppearance`. That class arrived in React Native 0.88.1
(react-native-tvos 0.88.1-0, which leaves it out of tvOS). On react-native-tvos
0.88.0-0, every iOS launch stopped in dyld:

```
Symbol not found: _OBJC_CLASS_$_RCTStatusBarAppearance
Referenced from: .../Streamyfin.app/Frameworks/ExpoModulesCore.framework/ExpoModulesCore
Expected in:     .../Streamyfin.app/Frameworks/React.framework/React
```

`expo` 58.0.23 asks for `expo-modules-core ~58.0.30`, and a lock file
maintenance on top of `expo` 58.0.22 (`~58.0.29`) resolves it too. Either one
needs the React Native patch the SDK was built for. `expo-doctor` does not
compare that version with an aliased `react-native-tvos`, so it stays green.

## Symptom pattern

The build succeeds and the app installs, then it closes as soon as it opens,
on every launch. There is no JS error and no Sentry event. The crash report says
`EXC_CRASH (SIGABRT)`, termination namespace `DYLD`, indicator
"Symbol missing".

## How to check

Before bumping `expo` or merging a lock file maintenance that moves
`expo-modules-core`, compare the `react-native` entry of
`node_modules/expo/bundledNativeModules.json` with the `react-native-tvos`
version in `package.json`, and launch a Release simulator build
(`bun scripts/ios/build-ios.ts --production --simulator --skip-credentials`).
