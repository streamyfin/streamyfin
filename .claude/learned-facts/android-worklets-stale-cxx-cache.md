# Android Native Build: Stale .cxx Cache for react-native-worklets

**Date**: 2026-08-22
**Category**: native-modules
**Key files**: `node_modules/*/android/.cxx/`, `node_modules/*/android/build/intermediates/cxx/`

## Detail

`bun run android` can fail with:

```
ninja: error: '.../react-native-worklets/android/build/intermediates/cxx/Debug/<hash>/obj/arm64-v8a/libworklets.so',
needed by '.../libreanimated.so' (or libexpo-modules-core.so), missing and no known rule to make it
```

Root cause: several native modules (`react-native-reanimated`, `expo-modules-core`, potentially others) link against `libworklets.so` from `react-native-worklets` via prefab. Each module's `.cxx` build cache bakes in the *absolute path including a content hash* (e.g. `2u685n3w`) for the worklets artifact it depends on. If `react-native-worklets`'s own `.cxx`/`build` dirs get cleaned/regenerated (manually, or by a partial `bun run submodule-reload`/upgrade), it gets rebuilt under a **new** hash directory — but consumer modules whose `.cxx` cache wasn't also cleaned still reference the **old** hash path, which no longer exists. This is not a Gradle parallel-execution race (verified with `--no-parallel`, same failure); it's a stale cache pointing at a stripped/renamed directory.

**Fix**: clean `.cxx` and `build/intermediates/cxx` for *all* native modules together, not just the one that seems implicated, then rebuild:

```bash
find node_modules -maxdepth 3 -type d -name ".cxx" -exec rm -rf {} +
find node_modules -maxdepth 4 -path "*/build/intermediates/cxx" -type d -exec rm -rf {} +
rm -rf android/app/.cxx
bun run android
```

Cleaning only `react-native-worklets` and `react-native-reanimated` is not sufficient — `expo-modules-core` also links against worklets and must be cleaned in the same pass.
