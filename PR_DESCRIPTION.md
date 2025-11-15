# 📦 chore(deps): upgrade deps and fix iOS build

## 🔖 Summary

Upgrade runtime dependencies (react-i18next, react-native-worklets), improve TypeScript type safety for screen orientation handling, and fix iOS build error from develop branch.

## 🏷️ Ticket / Issue

None

## 🛠️ What's Changed

- **Type**: chore
- **Scope**: deps, refactor
- **Summary**: Upgraded react-i18next and react-native-worklets to latest versions, improved type safety for screen orientation APIs, and fixed iOS build error

## 📋 Details

This PR upgrades key runtime dependencies, improves type safety across orientation-related code, and fixes an iOS build error present in the develop branch.

### Changes Made

**iOS Build Fix:**

- Removed root-level `icon` field from `app.json` to resolve Xcode build failure
- The iOS-specific liquid glass icon format was causing asset catalog compilation errors
- Build error: "None of the input catalogs contained a matching stickers icon set or app icon set named 'icon-ios-liquid-glass'"
- Removing the root icon allows the iOS-specific icon to be processed correctly

**Runtime Dependencies Updated:**

- `react-i18next`: 15.4.0 → 16.3.3 (latest internationalization features and improvements)
- `react-native-worklets`: 0.5.1 → 0.6.1 (performance optimizations)
- `typescript`: ^5.9.3 → ~5.9.3 (stricter version constraint for stability)

**TypeScript Type Safety Improvements:**

- Added explicit type annotations to orientation event handlers in `useOrientation` hook
- Fixed `OrientationLock` type references to use proper enum types from `.tv.ts` module
- Improved type consistency by using `Record<number, string>` for orientation enum mappings
- Reorganized imports to follow consistent pattern (third-party → internal)

### ⚠️ Breaking Changes

None

### 🔐 Security & Privacy Impact

None

### ⚡ Performance Impact

- react-native-worklets 0.6.1 includes performance optimizations for worklet execution
- No runtime behavior changes - orientation handling works exactly as before

## ✅ Checklist

- [x] I've read the [contribution guidelines](CONTRIBUTING.md)
- [x] Code follows project style and passes lint/format (bun scripts)
- [x] Type checks pass (tsc/biome/etc.)
- [x] Docs updated (README/ADR/usage/API) - N/A for dependency updates
- [x] No secrets/credentials included; env vars documented
- [x] Release notes/CHANGELOG entry added (if applicable) - N/A for internal tooling
- [x] Verified locally that changes behave as expected

## 🔍 Testing Instructions

1. Checkout branch: `git fetch origin && git checkout chore/update-dev-dependencies`
2. Install dependencies: `bun install`
3. Run type checks: `bun run typecheck`
   - [x] Verify no TypeScript errors
4. Run linter: `bun run lint`
5. Test orientation features:
   - [x] Screen rotation works correctly on mobile
   - [x] Orientation lock/unlock functions work
   - [x] TV platform continues to use landscape orientation
6. Test iOS build:
   - [x] iOS build completes successfully without icon-related errors
   - [x] App icons display correctly on iOS devices
7. Test i18n functionality:
   - [x] Language switching works
   - [x] Translations load correctly
8. Verification steps:
   - [x] All commands complete successfully
   - [x] No runtime errors
   - [x] Orientation behavior unchanged

## ⚙️ Deployment Notes

- No deployment impact - standard dependency updates
- Team members will need to run `bun install` to update dependencies
- No configuration changes required

## 📝 Additional Notes

**Why these updates?**

- **react-i18next 16.3.3**: Latest stable version with improved TypeScript support and performance
- **react-native-worklets 0.6.1**: Bug fixes and performance improvements for animation worklets
- **TypeScript constraint change**: Using `~5.9.3` instead of `^5.9.3` to avoid unexpected minor version updates

**Type safety improvements:**

The TypeScript changes fix incorrect usage of `OrientationLock` as a type when it was actually a runtime value. Now we properly import the enum type from the `.tv.ts` module for type checking while keeping runtime behavior identical.
