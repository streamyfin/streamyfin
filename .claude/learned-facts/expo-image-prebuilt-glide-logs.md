# Prebuilt expo-image Logs Every Image URL

**Date**: 2026-10-28
**Category**: build-and-tooling
**Key files**: `package.json` (`expo.autolinking.android.buildFromSource`)

## Detail

On Android, Expo links a precompiled `.aar` for its larger modules instead of
building them from source. expo-image reads the Glide log level from a build
flag, `BuildConfig.ALLOW_GLIDE_LOGS`, which its `build.gradle` takes from the
`EXPO_ALLOW_GLIDE_LOGS` Gradle property, `false` when unset. The prebuilt
`expo.modules.image-57.0.5.aar` ships with it on (`javap -constants` on its
`BuildConfig.class`). Expo's own test app sets `EXPO_ALLOW_GLIDE_LOGS=true` in
`apps/bare-expo/android/gradle.properties`, the likely origin.

With the flag on, Glide runs at `Log.VERBOSE` in release builds and writes a
`Finished loading ... for <url>` line to logcat for every image. Trickplay
sheets are requested with `?ApiKey=<token>`, so each scrub put the session's
access token in logcat.

`buildFromSource: ["expo-image"]` makes autolinking compile expo-image from
`node_modules`, where the property is unset and the flag is `false`. Setting
the property in the app's `gradle.properties` does nothing while the prebuilt
`.aar` is linked: the value is already compiled into it.

SDK 58's prebuilt `expo.modules.image-58.0.17.aar` has the flag off, so the
setting can go with the SDK 58 upgrade, once the APK built without it reads
the flag as `false`.

To check a build, read the flag from the APK:

```bash
unzip -o -q app-release.apk 'classes*.dex' -d /tmp/apk
for d in /tmp/apk/classes*.dex; do
  "$ANDROID_HOME"/build-tools/*/dexdump "$d" | grep -A4 "name *: 'ALLOW_GLIDE_LOGS'"
done
```

## Symptom pattern

`adb logcat` from a release build shows `D Glide : Finished loading` lines,
and the app never asked Glide for logs.
