# Local SyncPlay testing

Prerequisites: Docker Desktop, Python 3, FFmpeg (H.264/AAC encoders), Bun. Native testing also needs Xcode and CocoaPods.

```sh
python3 e2e/syncplay/setup.py
bun install --frozen-lockfile
EXPO_TV=0 bun x --no-install expo start --dev-client --port 8081
```

For additional decoder tests, run the temporary browser harness in a second terminal:

```sh
bun run syncplay:test:web
```

The decoder test client requires the explicit development flag set by this launcher. It lives under [web/](web/README.md); normal web starts and release builds keep it disabled. Native Streamyfin and Jellyfin's official web client remain the acceptance targets.

The setup script starts isolated official Jellyfin `10.11.11`, finishes onboarding, creates two SyncPlay-enabled users, and scans three generated two-minute H.264/AAC fixtures. It is safe to rerun against this test instance. It binds only to the host loopback interface. No existing Jellyfin container or media is touched.

- Jellyfin browser: <http://127.0.0.1:18096/web/>
- Streamyfin native Metro: <http://localhost:8081/>
- Temporary browser decoder harness: <http://localhost:8083/>
- Native server URL: `http://127.0.0.1:18096`
- Host user: `syncplay-host`
- Guest user: `syncplay-guest`
- Test password (both users): `SyncPlay-local-2026`
- Local tokens and media IDs: ignored `.state/credentials.json`
- Generated media/config/cache: ignored `.state/`
- Test evidence/logs: ignored `artifacts/`

`SYNCPLAY_PORT` changes the loopback port. These credentials belong only to this disposable local server.

Native development build:

```sh
EXPO_TV=0 bun x --no-install expo prebuild --platform ios --no-install
cd ios
pod install
cd ..
EXPO_TV=0 bun x --no-install expo run:ios --device '<simulator UDID>' --no-bundler
```

Android testing uses a separate AVD under `/private/tmp/streamyfin-syncplay-avd-home`, the installed Android 36 Google Play ARM64 image, and emulator port 5580. Existing AVD data is preserved:

```sh
python3 e2e/syncplay/start-android.py
```

In another terminal:

```sh
EXPO_TV=0 bun x --no-install expo prebuild --platform android --no-install
adb -s emulator-5580 reverse tcp:8081 tcp:8081
adb -s emulator-5580 reverse tcp:18096 tcp:18096
EXPO_TV=0 bun x --no-install expo run:android --device emulator-5580 --no-bundler
```

Use JDK 17 for this project's Gradle build. The Android reverse ports allow the same local server URL as iOS.

Current Android acceptance uses the dedicated official Qt emulator app on `emulator-5580`. Prepare its macOS app identity for CUA-visible UI:

```sh
python3 e2e/syncplay/prepare-android-app.py
open -a '/private/tmp/Streamyfin Native Android.app' --args \
  -avd StreamyfinSyncPlay -port 5580 -no-snapshot -gpu host -memory 3072
```

Stop the existing **SyncPlay** emulator cleanly before this launch; confirm its serial/AVD name first. The preparation script copies the official emulator binary under `/private/tmp`, preserves its Hypervisor/JIT entitlements, and leaves the installed SDK unchanged. It refuses to replace its running copy. The dedicated app reuses the same AVD data/APK and can be bound by CUA as `local.streamyfin.nativeandroid`. Restore reverse ports after each emulator restart.

Android Studio's **Running Devices** path was an earlier discovery experiment. Its task-only `~/.android/avd/StreamyfinSyncPlay.ini` pointer references the same AVD; embedded input proved unreliable. Do not launch a second copy of this AVD while the dedicated Qt app is running.

For local acceptance, use `syncplay-guest` in Streamyfin and `syncplay-host` in official Jellyfin web at port 18096. SyncPlay automatically presents the Swift/Kotlin `NativePlayer`, regardless of the solo-player preference. For Android solo-player testing, select **Native** in video-player settings. Capture the actual native controls and playback frames. The React Native `direct-player` screen with an MPV decoder does not verify this presentation path. SyncPlay uses Jellyfin's built-in protocol. Port 8083 hosts a temporary decoder harness for development testing. Results and runtime scope are in [VERIFICATION.md](VERIFICATION.md).

After changing native module sources, rebuild and reinstall the development app; Metro refresh cannot add native exports. Existing projects can be reused without prebuild. Run `pod install` when adding Swift files so CocoaPods updates its source list. Local incremental commands used in this checkout:

```sh
GEM_HOME=/Users/fredrikburmester/.rvm/gems/ruby-3.2.2 \
  GEM_PATH=/Users/fredrikburmester/.rvm/gems/ruby-3.2.2:/Users/fredrikburmester/.rvm/rubies/ruby-3.2.2/lib/ruby/gems/3.2.0 \
  /Users/fredrikburmester/.rvm/rubies/ruby-3.2.2/bin/ruby \
  /Users/fredrikburmester/.rvm/gems/ruby-3.2.2/bin/pod install --project-directory=ios
RCT_METRO_PORT=8081 EXPO_TV=0 xcodebuild \
  -workspace ios/Streamyfin.xcworkspace -scheme Streamyfin -configuration Debug \
  -destination 'platform=iOS Simulator,id=026EA6A6-4FF1-4D96-BAF5-4415480D97DD' \
  -derivedDataPath /private/tmp/streamyfin-syncplay-derived \
  CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=- build
python3 -c 'import plistlib; plistlib.dump({}, open("e2e/syncplay/.state/simulator-entitlements.plist", "wb"))'
codesign --force --sign - --entitlements e2e/syncplay/.state/simulator-entitlements.plist \
  /private/tmp/streamyfin-syncplay-derived/Build/Products/Debug-iphonesimulator/Streamyfin.app
xcrun simctl install 026EA6A6-4FF1-4D96-BAF5-4415480D97DD \
  /private/tmp/streamyfin-syncplay-derived/Build/Products/Debug-iphonesimulator/Streamyfin.app
xcrun simctl openurl 026EA6A6-4FF1-4D96-BAF5-4415480D97DD \
  'exp+streamyfin://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081'
```

The empty-entitlement ad hoc signature is for this simulator build; it uses no host signing keys. The deep link configures Metro on first launch. For subsequent cold launches of this configured development client, use `xcrun simctl launch 026EA6A6-4FF1-4D96-BAF5-4415480D97DD com.fredrikburmester.streamyfin` alone. An immediate second deep link during startup reproduced an Expo Fabric AppContext assertion in this local environment; launch-only remained alive.

```sh
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
  ANDROID_HOME=/Users/fredrikburmester/Library/Android/sdk \
  ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=3
cd ..
adb -s emulator-5580 install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5580 reverse tcp:8081 tcp:8081
adb -s emulator-5580 reverse tcp:18096 tcp:18096
adb -s emulator-5580 shell am start -W -a android.intent.action.VIEW \
  -d 'exp+streamyfin://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' \
  com.fredrikburmester.streamyfin
```

The simulator UDID and JDK/SDK paths above describe this local run; use your own installed paths elsewhere. Preserve build caches between rounds. Builds and CLI process launch establish compilation/lifecycle only; the acceptance round must operate the Swift/Compose controls and official Jellyfin web client through their actual UIs.

With both clients logged in, validate group creation/details/list/join/leave; start/play/pause/seek/Stop; queue append/Play Next/select/reorder/remove/clear; repeat off/one/all; shuffle on/off; ignore-wait on/off; buffering/Ready; reconnect and independent playback after leaving. Record actual playback positions and group/member state, plus screenshots. Server API tests complement these UI checks; they do not replace them.

Capture read-only, token-free evidence after each UI action:

```sh
python3 e2e/syncplay/observe.py --label joined --expect-members 2
python3 e2e/syncplay/observe.py --label paused --expect-paused true --max-skew 2
python3 e2e/syncplay/observe.py --label playing --expect-paused false
```

Observations append to `artifacts/observations.json`. Jellyfin already advances playing positions each second; the helper uses that server estimate without adding `LastPlaybackCheckIn` age again. Playing skew can still be unreliable during buffering or transitions. Historical captures retain their former double projection. Compare actual browser/native playback and stable paused API positions. `--expect-item <item ID>` checks media identity in both sessions.

When another test client remains open, restrict playback assertions to the clients under test with repeated device filters, such as `--device Chrome --device 'iPhone 18 Pro'`.

For genuine native EOF tests, leave the browser out of the group so its own EOF cannot trigger the transition. Use `--device <native device name> --expect-active 1` for single-decoder item/pause assertions, then verify the actual native frame and EOF/command logs.

The production controller also has live protocol coverage against this Docker server:

```sh
bun e2e/syncplay/controller-integration.ts
```

This harness uses real Jellyfin REST/WebSocket traffic with simulated decoder states. Its 32 behavioral cases exercise all 22 SyncPlay endpoints, including duplicate playlist identity, queue edits, repeat EOF and boundary navigation, shuffle, ignore-wait barriers, Stop followed by lobby Play, permissions, reconnect, and stale commands. Each run creates isolated device sessions and a temporary group, preserves acceptance groups, and deletes its restricted test account. It writes token-free `artifacts/controller-integration.json` with case results, events, successful requests, and endpoint coverage.

Jellyfin 10.11.11 buffering initially pauses a playing group. Enabling ignore-wait while that member remains buffering releases the other ready members; disabling it restores the readiness barrier. This follows the built-in [playing](https://github.com/jellyfin/jellyfin/blob/v10.11.11/MediaBrowser.Controller/SyncPlay/GroupStates/PlayingGroupState.cs) and [waiting](https://github.com/jellyfin/jellyfin/blob/v10.11.11/MediaBrowser.Controller/SyncPlay/GroupStates/WaitingGroupState.cs) state handlers.

Stop this test server while preserving local state:

```sh
docker compose -f e2e/syncplay/compose.yml down
```

Delete only this test instance's `.state/` directory to reset onboarding and media.
