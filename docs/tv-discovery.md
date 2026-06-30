# TV Discovery

This document explains Streamyfin's platform-specific home screen discovery integrations for Apple TV and Android TV.

## Overview

Streamyfin currently publishes the same "Continue and Next Up" content to two different platform surfaces:

- `tvOS`: Apple TV Top Shelf
- `Android TV`: preview channel recommendations

Both integrations are fed by the same shared payload builder in [utils/tvDiscovery/payload.ts](../utils/tvDiscovery/payload.ts).

## Shared Data Flow

The TV home screen data starts in [components/home/Home.tv.tsx](../components/home/Home.tv.tsx), where the app fetches resume and next-up items and passes them into [utils/tvDiscovery/sync.ts](../utils/tvDiscovery/sync.ts).

The sync layer:

- builds a normalized TV discovery payload
- sends it to the tvOS Top Shelf cache writer on Apple TV
- sends it to the Android TV recommendations module on Android TV
- clears published content when server or user state changes

## Apple TV Top Shelf

Apple TV uses a Top Shelf extension target, not the main app process.

Relevant files:

- [plugins/withTVOSTopShelf.ts](../plugins/withTVOSTopShelf.ts)
- [targets/StreamyfinTopShelf/TopShelfProvider.swift](../targets/StreamyfinTopShelf/TopShelfProvider.swift)
- [modules/top-shelf-cache/ios/TopShelfCacheModule.swift](../modules/top-shelf-cache/ios/TopShelfCacheModule.swift)
- [utils/topshelf/cache.ts](../utils/topshelf/cache.ts)

How it works:

- the app builds a lightweight JSON payload
- the app stores that payload in the shared app group container
- the tvOS Top Shelf extension reads the cached payload
- the extension renders sections and items for Top Shelf

Why the API key is stored on tvOS:

- the Top Shelf extension runs outside the app process
- it may need authenticated image access when loading poster artwork
- the app stores the API key so the extension can build authenticated requests

## Android TV Recommendations

Android TV uses the TV provider APIs to publish a preview channel and preview programs.

Relevant files:

- [modules/tv-recommendations/android/src/main/java/expo/modules/tvrecommendations/TvRecommendationsPublisher.kt](../modules/tv-recommendations/android/src/main/java/expo/modules/tvrecommendations/TvRecommendationsPublisher.kt)
- [modules/tv-recommendations/android/src/main/java/expo/modules/tvrecommendations/TvRecommendationsModule.kt](../modules/tv-recommendations/android/src/main/java/expo/modules/tvrecommendations/TvRecommendationsModule.kt)
- [modules/tv-recommendations/android/src/main/java/expo/modules/tvrecommendations/TvRecommendationsReceiver.kt](../modules/tv-recommendations/android/src/main/java/expo/modules/tvrecommendations/TvRecommendationsReceiver.kt)
- [modules/tv-recommendations/android/src/main/AndroidManifest.xml](../modules/tv-recommendations/android/src/main/AndroidManifest.xml)
- [utils/tvDiscovery/sync.ts](../utils/tvDiscovery/sync.ts)

How it works:

- the app builds the shared TV discovery payload
- the Android native module creates or updates a single preview channel
- the module inserts or updates preview programs for each item
- the module stores the last payload in shared preferences
- the `INITIALIZE_PROGRAMS` receiver can replay the cached payload when requested by the system

Important differences from tvOS:

- Android TV does not use a separate extension target
- Android TV content is persisted through `TvContractCompat`
- artwork is currently published as poster URLs, not app-proxied local content

## Logging

### JavaScript logs

Look for `TVDiscovery` in Metro or app logs.

Examples:

- payload prepared
- Android sync result
- clear operations

### Native Android logs

Use `adb logcat | grep TvRecommendations`

Examples:

- channel created or updated
- preview programs inserted or updated
- stale programs deleted
- cached payload replayed

## Verifying Android TV Output

1. Launch the TV build and let the home screen load.
2. Watch `adb logcat | grep TvRecommendations`.
3. Return to the Android TV / Google TV home screen.
4. Look for the `Continue and Next Up` row.
5. If needed, enable the Streamyfin channel in `Customize home` or `Manage channels`.

Note:

- some launchers delay or hide new preview channels
- some devices expose TV provider data per user/profile

## Build Notes

This feature does not currently require a fresh `prebuild` to work in the checked-in Android project.

Why:

- the Android integration is a local Expo module
- its receiver is declared in the module manifest
- Gradle merges it during normal Android TV builds

Typical commands:

- `bun run android:tv`
- `bun run ios:tv`

## Current Limitations

- Android TV artwork may fail on authenticated Jellyfin servers because the launcher fetches poster URLs outside the app
- Android TV currently publishes a preview channel only, not Watch Next
- tvOS and Android TV both use the same payload source, so section selection is shared unless explicitly split later

## Future Improvements

- add a local image proxy or cache for Android TV artwork
- add Watch Next support for resumable content
- add a native debug dump method for querying TV provider state from inside the app process
