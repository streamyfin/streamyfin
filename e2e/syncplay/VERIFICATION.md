# Local verification — 2026-10-05–06

Environment: official Jellyfin 10.11.11 Docker container and web client on loopback port 18096, three generated 120-second H.264/AAC clips, native Metro 8081, and a temporary browser decoder harness on 8083. Acceptance requires the presented Swift/Kotlin `NativePlayer` interoperating with official Jellyfin Web through built-in SyncPlay. Test accounts and reproduction commands are in [README.md](README.md).

**Local presented NativePlayer acceptance passed.** Actual Swift and Kotlin Compose controls interoperated with official Jellyfin Web. Both platforms independently originated genuine EOF in all three repeat modes. Final three-client handoff is paused on Clip 1: Web 83.237 seconds, Swift and Kotlin 83.2372463 seconds; reported API positions differ by 0.2463 ms. Actual frames and native controls were checked separately. Earlier React Native `direct-player` results remain reference evidence in `artifacts/reference-rn-mpv/`, with a scope manifest.

| Check | Result | Evidence |
| --- | --- | --- |
| Earlier iOS simulator cold build | Passed before NativePlayer SyncPlay changes | `artifacts/xcodebuild.log` |
| Earlier iOS embedded-MPV EOF callback rebuild | Passed; installed and launched before NativePlayer SyncPlay changes | `artifacts/xcodebuild-incremental.log` |
| Earlier Android ARM64 debug build | Passed, 1,346 tasks, 13m 52s; before NativePlayer SyncPlay changes | `artifacts/android-build.log` |
| Earlier Android APK install and launch | Passed on isolated emulator 5580; lifecycle only | `android/app/build/outputs/apk/debug/app-debug.apk`; app process started, no AndroidRuntime fatal error |
| Updated Swift NativePlayer build/install/launch | Latest physical-pause build passed; exact incoming pause target and physical decoder progress flush included; data-preserving install and launch-only PID 44129 alive after 78 seconds with final FIFO JavaScript, no matching crash report | `artifacts/xcodebuild-native-player-physical-pause.log`, `artifacts/native-player-ios-build.json`, `artifacts/native-player-ios-final-fifo-runtime.json` |
| Swift native checks | Eight scheduler checks passed; parser checks passed for the three changed files; incremental Xcode compilation passed | Core agent validation; final source hashes in `artifacts/native-player-ios-physical-pause-build-inputs.json` |
| Updated Kotlin NativePlayer build/install/launch | Final exact-seek/pause/PiP build passed; 50s, 44 executed / 1,302 cached tasks; installed preserving login data and cold-launched with final FIFO JavaScript on emulator 5580, PID 9354 | `artifacts/android-native-player-exactseek-pip-build.log`, `artifacts/native-player-android-build.json`, matching install/launch logs |
| Kotlin native scheduler/unit tests | Final sources: 34 passed across eight suites | `artifacts/android-native-exactseek-pip-unit.json` records Gradle XML results; `artifacts/android-native-exactseek-pip-unit.log` |
| Swift NativePlayer + official-Web UI matrix | Passed on final binary/FIFO JavaScript; actual controls, official interoperability, background/solo/rejoin, queue Stop/restart/clear and all three native-origin EOF modes | `artifacts/native-player-swift-final-observations.json`, `artifacts/native-player-swift-final-native-only-eof-summary.json`; additional queue/mode UI evidence below |
| Kotlin NativePlayer + official-Web UI matrix | Passed; 33 passing records plus retained, superseded debugging records | `artifacts/native-player-android-ui-cases.json`; actual Compose controls, official interoperability, queue/modes, all three native-origin EOF modes and lifecycle |
| All-actions controller live integration | 32/32 cases passed after final socket heartbeat/retry fix; 22/22 endpoints; 105 successful SyncPlay requests | `artifacts/controller-integration.json`, `artifacts/controller-integration-native-player.log`; 2026-10-06 09:03:09.788 UTC; simulated decoder states |
| Shared Stop live protocol | Both simulated decoders close; group becomes Idle and retains both members | `artifacts/controller-integration.json`, `group stop closes both decoders` |
| Lobby Play after shared Stop | Both simulated decoders restart the retained current entry; playlist IDs and order are preserved | `lobby Play after Stop restarts current entry and preserves queue` |
| Web restart/stop races | 3 regression tests passed: same URL remount, delayed Stop vs new launch, canceled pending lookup | `e2e/syncplay/web/WebPreview.test.tsx` |
| Expo Doctor | 19/20 with Ruby 3.2 / CocoaPods 1.16.2; seven unchanged Expo patch versions | `artifacts/expo-doctor.log`; package pins match baseline HEAD |
| Latest complete Jest suite | 139 suites / 1,781 tests passed after final immutable FIFO playback-report fix | `artifacts/jest-native-player-final.log` |
| TypeScript / Biome / i18n | Final checks passed; Biome checked 1,005 files without writes; no missing or unused translation keys | `artifacts/typecheck-native-player-final.log`, `artifacts/biome-native-player-final.log`, `artifacts/i18n-native-player-final.log` |
| Final source/build audit | 38 Swift, 57 Kotlin and 10 checked JavaScript/TypeScript source hashes match; both iOS binary hashes and Android APK hash match | `artifacts/native-player-final-manifest-audit.json`; finalized acceptance index `artifacts/native-player-final-acceptance-summary.json` |
| Jellyfin Web + temporary browser harness playback | Passed; actual decoder positions 24.976095 / 24.948001 seconds | `artifacts/browser-playback.json`, `final-fixed-web-start` |
| Jellyfin Web + temporary browser harness pause | Passed; actual decoder positions 25.206 / 25.206832 seconds, both paused | `artifacts/browser-playback.json`, `final-fixed-web-pause` |
| RN direct-player paused late join (reference) | Passed; MPV frame at 25 seconds, browser at 25.206 | `artifacts/reference-rn-mpv/observations.json`, `final-native-joining` |

Presented Swift NativePlayer + official Jellyfin Web: earlier captures before the final physical-pause refinement. Final-binary retests follow below:

| Scenario | Observed result | Evidence |
| --- | --- | --- |
| Paused late join | Actual Swift native controls/frame visible; official/native paused positions 19.744 / 19.7442797 seconds, less than 0.3 ms apart | `artifacts/native-player-swift-late-join.png`; `artifacts/native-player-observations.json`, `native-player-swift-paused-late-join` |
| Swift paused late join after autoplay fix | Both paused on Clip 2 at 76.467 / 76.467196 seconds, less than 0.2 ms apart | `native-player-swift-final-paused-late-join` |
| Swift genuine Repeat One EOF | Both restart Clip 2 and physically play; subsequent paused positions 30.506 / 30.5069629 seconds, less than 1 ms apart | `native-player-swift-final-genuine-repeatone-paused`; `artifacts/native-player-swift-final-repeatone.png` |
| Swift Next | Both play Clip 3 after the native queue action | `native-player-swift-final-next-clip3` |
| Repeat All Next wrap | Both wrap from the last entry to Clip 1 and play | `native-player-swift-final-repeatall-next-wrap` |
| Repeat All Previous wrap | Native Previous wraps back to the last entry | Root's actual UI action record; active-group server trace |
| Swift Play, then official-Web Pause | Shared playback; official/native paused positions 26.686 / 26.7083333 seconds | `native-player-official-pause-after-swift-play` |
| Swift paused +30-second seek | Both remain paused at 56.708 / 56.7083333 seconds | `native-player-swift-paused-fractional-seek` |
| Official rapid Pause + Home-to-zero | Both decoders reach zero paused; native Ready accepted, but official Web sends Buffer three seconds later and group remains Waiting | `native-player-official-home-seek-waiting`; `artifacts/native-player-official-web-buffer-trace.log` |
| Recovery from official-Web Buffer stall | Official Play clears the barrier; group returns to Playing with both clients | `native-player-official-home-seek-play-recovery` |
| Swift queue modes | Actual Swift UI exercised Repeat Off/One/All, Shuffle On/Off, and Ignore Wait On/Off | `native-player-swift-options-queue-insert`; final Repeat One/All cases above |
| Swift append / Play Next | Appended Clip 2 and queued Clip 3 next through actual Swift queue UI | `native-player-swift-options-queue-insert`; later shared Next reaches Clip 3 |
| Swift duplicate selection/removal and queue tools | Selected duplicate entries, removed the older entry, kept current while clearing upcoming items, searched, used Play Now, and refreshed through actual Swift UI | Root's actual UI action record; active-group server trace |
| Final shared Stop | Both decoder sessions clear; group becomes Idle and retains both members | `native-player-swift-final-shared-stop-idle` |
| Earlier Clear All attempt | Controller had left after a JavaScript reload, so no RemoveFromPlaylist request reached the server; retained as a development timing failure | `native-player-swift-final-clear-all`; `artifacts/native-player-clearall-active-group-sanitized.log`; successful final retest below |

Latest Swift binary with final FIFO JavaScript:

| Scenario | Observed result | Evidence |
| --- | --- | --- |
| Final paused late join | Actual Swift controls/frame confirmed; both API sessions paused on Clip 1 at 18.929 / 18.9299011 seconds, less than 1 ms apart | `artifacts/native-player-swift-final-observations.json`, `swift-final-fifo-paused-late-join`; `native-player-swift-final-fifo-late-join.png` |
| Final native Play/Pause and bidirectional seek | Native Play, official-Web playing seek, native Pause, and native +30 paused seek operated actual decoders. Both physically paused at 48 seconds; official-Web API temporarily retained playing while the native report was correct | Root actual UI record; timing-qualified snapshots in `native-player-swift-final-observations.json` |
| Final official-Web Pause | Actual Swift and browser decoders pause; both API reports settle at 55.904 / 55.9044377 seconds, less than 0.5 ms apart | `swift-final-fifo-official-pause` |
| Final Clear All | Swift dismisses to the empty group lobby with transport disabled; official Web closes its decoder. Server group is Idle, both decoder items are null, and both members remain | `swift-final-native-clearall-idle` |
| Final Stop with retained queue | Swift dismisses to the Idle lobby with current Clip 1 still queued and Play enabled; both decoder items are null and both members remain | `swift-final-native-stop-retained-lobby` |
| Final lobby Play after Stop | Actual Swift player reopens the retained Clip 1 entry; official Web plays too. Subsequent paused API positions 18.828 / 18.8288864 seconds differ by less than 1 ms | `swift-final-lobby-play-restart-paused` |
| Final non-PiP background | Simulator Home leaves the native membership at 09:32:25 UTC; official Web remains paused at 18.828 seconds in the one-member group | `swift-final-nonpip-background-leave`; `artifacts/native-player-swift-final-lobby-background-server.log` |
| Final foreground solo controls | Returning keeps Swift solo. Native Play/Pause/Seek changes its position independently; final native API is paused at 60.2916666 seconds while official Web remains paused at 18.828 | `swift-final-foreground-solo-seek`; root actual Swift controls/frame |
| Final playing rejoin | Explicit rejoin while official Web plays reopens the native player; subsequent paused API positions 27.5 / 27.5004223 seconds differ by less than 0.5 ms | `swift-final-playing-rejoin-paused` |
| Final native Create / Leave | Actual native queue Leave returns solo, then Swift creates its own single-member Idle group while the official-Web group remains independent | `swift-final-native-create-group`, group `2af8a76debea44318f1561ff2d348bbc` |
| Final genuine Repeat Off EOF, native-only group | From paused 97.2846755 seconds, actual Swift playback naturally finishes and dismisses to the retained lobby. Sole-native Stop at 09:36:22 UTC makes the group Idle with its guest retained and native item null | `swift-final-native-only-repeatnone-eof-stop`; `artifacts/native-player-swift-final-native-only-eof-summary.json` |
| Final genuine Repeat All EOF, native-only group | Last Clip 2 entry naturally finishes; sole-native Next at 09:39:10 UTC reloads Clip 1 and resumes. Subsequent actual/API native Pause holds at 10.7760844 seconds | `swift-final-native-only-repeatall-wrap-paused`; `artifacts/native-player-swift-final-native-only-eof-server.log` |
| Final genuine Repeat One EOF, native-only group | Sole-native Next at 09:42:15 UTC reloads the same Clip 1; Ready/Playing follows at 09:42:16. Actual native queue retains current index 0 with Clip 1 + Clip 2 and One video; subsequent Pause holds at 15.9795564 seconds | `swift-final-native-only-repeatone-restart-paused`; `artifacts/native-player-swift-final-native-only-eof-summary.json` |

Swift PiP is unavailable on this iOS simulator: `AVPictureInPictureController.isPictureInPictureSupported()` returns false. Android provides the actual PiP acceptance coverage below; no Swift PiP runtime pass is claimed. Control Center could not be opened by the attempted CUA gestures, so its transient-inactivity UI case was not exercised; this is a test-tool limitation.

Swift's persisted native logger omits literal end-file events. Its final native-only EOF proof combines actual playback/dismissal, a group with one decoder, and the sole-native Stop request. The final stopped report at 118.958 seconds is the last physical report, not a claim that EOF occurred early.

Final native behavior: shared sources load paused, native schedulers apply server commands, and Ready follows decoder readiness. Authoritative same-entry restarts reload the source after EOF; EOF and async-launch guards reject obsolete entries. A 250 ms runtime buffering debounce avoids short seek-loading feedback while initial loads report immediately. Android paused-seek reports use the physical decoder position. Start, Progress, and Stop reports capture immutable snapshots and run in FIFO order, preventing an older playing report from overwriting a paused state. Native playback owns a background socket lease; transient inactivity preserves the connection, while API/network teardown overrides the lease. Final Swift and Kotlin timing, lifecycle and genuine EOF cases passed.

Retained qualifications: official Jellyfin Web sends a stale Buffer three seconds after some paused seeks, despite accepted native Ready. The final three-client case reached exactly 36.726 seconds paused in every API session, then Web Buffer put the group back into Waiting. Two official Unpause requests recovered Playing; final Pause settled the group. Trace: `artifacts/native-player-three-client-paused-seek-server.log`, `artifacts/native-player-three-client-recovery-server.log`. Earlier development HMR left membership while the native presentation remained visible; the final cold-app Clear All retest passed. Immediate launch-plus-deep-link reproduced an Expo Fabric assertion, resolved locally with launch-only. Device Hub framebuffer/input faults required GUI/CUA recovery without app/data reset. Historical failures and recovery evidence remain retained and scoped; they are not silently counted as passes.

Presented Kotlin NativePlayer + official Jellyfin Web: completed UI coverage:

| Scenario | Observed result | Evidence |
| --- | --- | --- |
| Final Compose paused late join | Actual Compose controls/frame visible; both paused at 13.724 / 13.7245641 seconds, less than 0.6 ms apart | `artifacts/native-player-android-observations.json`, `native-player-android-paused-late-join`; `artifacts/native-player-android-paused-late-join.jpg` |
| Official-Web paused seek into Compose | Both physical decoders paused at exactly 75.852 seconds; captured group Waiting due to the retained official-Web buffering caveat | `native-player-android-official-paused-seek-reverse` |
| Final Compose genuine Repeat One EOF, native-only group | Native decoder reaches EOF, sends Next, reloads the same clip, and resumes | `native-player-android-final-repeatone-after-eof.jpg`; `artifacts/native-player-android-final-eof-summary.json`, EOF 08:37:07 UTC |
| Final Compose genuine Repeat All EOF, native-only group | Native decoder reaches EOF on the last Clip 2 entry and wraps to Clip 1 | `native-player-android-final-repeatall-genuine-wrap`; `native-player-android-final-repeatall-after-eof.jpg`; EOF/native Next 08:43:36 UTC |
| Final Compose genuine Repeat Off EOF, native-only group | Native decoder reaches EOF, sends Stop, closes the player, and leaves the group Idle with its member retained | `native-player-android-final-repeatnone-genuine-stop`; `native-player-android-final-repeatnone-after-eof.jpg`, `native-player-android-final-repeatnone-retained-lobby.jpg`; EOF/native Stop 08:46:13 UTC |
| Final socket-fix Compose PiP remote Pause and retention | Native PiP frame pauses at 72.291667 seconds after the official-Web command; socket/group remains connected beyond 140 seconds | `native-player-android-final-socket-pip-90s`; `native-player-android-final-socket-pip-paused.jpg`; `artifacts/native-player-android-final-90s-pip-summary.json` |
| Final FIFO Compose PiP remote Pause | Actual PiP frame freezes; both API sessions correctly report paused at 18.929 / 18.9299011 seconds, less than 1 ms apart. MPV confirms exact target and a paused 24 fps frame at 18.958333 seconds | `native-player-android-final-fifo-pip-remote-pause`; `native-player-android-final-fifo-pip-paused.jpg`; `artifacts/native-player-android-final-fifo-pip-summary.json` |
| Final non-PiP background | Power screen-off triggers native stopped-host leave and pause at 09:17:57 UTC; official Web remains paused and is the sole group member | `native-player-android-final-background-leaves-group`; native/server logs in the FIFO PiP summary |
| Final independent native controls | After returning, solo native Play/Pause/Seek changes the Android position while official Web remains paused at 18.929 seconds | `native-player-android-final-solo-native-play-pause-seek`; actual Compose UI capture |
| Compose group and all queue actions | Create/list/join/Refresh/Leave; append/Play Next/select/move up/down/remove; keep-current/clear-all; native library search/Play now; previous/next; Stop/lobby Play all exercised through actual Compose controls | `artifacts/native-player-android-ui-cases.json`, 33 passing records, screenshots and observations indexed per case |
| Compose playback modes | Repeat Off/One/All, Shuffle On/Off and Ignore Wait On/Off exercised; server behavior and buffering semantics independently asserted by live controller cases | Android UI ledger and 32-case live controller report |

Removing/restoring Android reverse port 18096 did not close its existing TCP connection. Membership and paused playback remained intact; this attempted fault injection does not verify native reconnect. The isolated controller harness separately verifies actual socket close, server member removal, and reconnect remaining solo. Trace: `artifacts/native-player-android-final-reverse-loss-server.log`; snapshot: `artifacts/native-player-android-reverse-loss-observations.json`.

Final actual three-client round, official Jellyfin Web + Swift + Kotlin:

| Scenario | Paused API positions, Web / Swift / Kotlin | Result |
| --- | --- | --- |
| Paused join | 27.5 / 27.5004223 / 27.5004223 | Passed; 0.4223 ms reported skew |
| Official Play, then Pause | 46.726 / 46.726299 / 46.726299 | Passed; 0.299 ms reported skew; actual native frames advanced then paused |
| Official paused -10-second seek | 36.726 / 36.726 / 36.726 | Passed positions; upstream Web Buffer left group Waiting, qualified above |
| Recovered final handoff | 83.237 / 83.2372463 / 83.2372463 | Passed; canonical group Paused; 0.2463 ms reported skew |

Evidence: `artifacts/native-player-three-client-observations.json`; actual controls/frame screenshots `native-player-three-client-swift-final.png`, `native-player-three-client-official-web-final-controls.jpg`, and `native-player-three-client-android-final-paused-controls.jpg`. Three device sessions share two distinct usernames; Jellyfin's Participants list deduplicates usernames. The earlier expected-three-participants assertion is retained with this fixture correction. API precision does not imply sub-millisecond physical decoder measurement; native display clocks have one-second resolution.

Reference matrix: iOS React Native direct-player controls + temporary browser harness passed using actual MPV and browser decoders. The word "native" in historical scenario IDs describes the iOS client/decoder, not the presented Swift NativePlayer UI:

| Scenario | Observed result | Evidence scenario |
| --- | --- | --- |
| Native creates group and starts a movie; browser joins | Shared native-originated playback | UI matrix |
| Native play/pause; paused rejoin | Both paused at exactly 28.8 seconds | `final-fractional-paused-rejoin` |
| Native +30 seek; browser PageUp seek | Both paused at exactly 116.4 seconds | `final-fractional-shared-seek` |
| Shared Next / Previous | Both switch to Clip 2 / Clip 1 | `final-native-queue-next`, `final-native-queue-previous`, `native-queue-next-settled` |
| Genuine Clip 1 EOF | Both advance to Clip 2 and play; paused positions 11.9025345 / 11.902534 seconds | `final-genuine-eof-next`, `final-genuine-eof-paused` |
| Leave and independent playback | Native plays at 40 seconds; browser remains paused at 38 | `native-leave-solo-play` |
| Background and foreground | Native pauses at 14 seconds and leaves; group has one member, browser continues; foreground stays solo | `final-native-background-leaves`, `native-background-and-foreground` |
| Explicit rejoin while playing | Native displays 58 seconds; browser samples 59.170519; both play in the group | `native-playing-rejoin` |
| Native library starts another movie | Both play Clip 3; native displays 12 seconds, browser samples 12.043026 | `native-library-launch-after-stop` |
| Shared Stop and same-item queue restart | Stop clears both decoder sessions; group stays Idle with both members; repeated queue launch resumes playback | `final-stop-cleared-decoders`, `final-stop-cleared-video` |
| Acceptance state | Both paused on Clip 1 at 7.9344471 / 7.934447 seconds | `final-acceptance-paused`; `artifacts/native-syncplay-final.png`, `artifacts/web-syncplay-final.jpg` |

Reference evidence index: `artifacts/reference-rn-mpv/browser-playback.json` records browser decoder positions and observed RN direct-player states; `artifacts/reference-rn-mpv/observations.json` records token-free server sessions/groups. Scenario names above identify entries in those files. The iOS displayed times have one-second resolution and were captured separately from browser samples.

Observations preserve failed captures from debugging. Historical snapshots added `LastPlaybackCheckIn` age to positions Jellyfin already advances, causing double projection. The revised helper uses server `PositionTicks` directly; `projectedPositionSeconds` remains an alias for compatibility. Use `--expect-active 1` for native-only EOF assertions. Server estimates can still be incorrect during buffering or when an obsolete playing report overwrites a paused state. Native NowPlaying/progress can also reflect cached seek metadata after decoder EOF; it alone does not establish physical playback. Final conclusions prioritize actual frames/advancing native UI and stable paused API positions together. Early PNGs and `artifacts/browser-protocol.json` cover implementation debugging. Controller integration uses real REST/WebSocket traffic with simulated decoder states.

Reference iOS testing used iPhone 18 Pro, iOS 27.0, through Xcode Device Hub. The final Swift app was ad hoc signed with empty simulator entitlements; custom keychain identity and device capabilities caused launch rejection and were removed. Earlier SecureStore entitlement warnings remain a simulator limitation; no host signing keys were changed or used.

Android uses a dedicated Android 36 ARM64 AVD with mutable data under `/private/tmp/streamyfin-syncplay-avd-home`. Acceptance used the copied official emulator Mach-O in `/private/tmp/Streamyfin Native Android.app` on `emulator-5580`; `prepare-android-app.py` reproduces its CUA-visible bundle without modifying the SDK. Android Studio discovery was an earlier experiment; embedded input was unreliable. Both phone NativePlayer UI rounds are complete. Apple TV and Android TV device/D-pad runtime rounds were not run; Android phone MPV is the tested renderer. No Swift PiP or Control Center runtime pass is claimed on this simulator.

All 22 built-in SyncPlay endpoints have successful real-server responses and behavioral assertions in the production-controller harness:

| Endpoint | Verified behavior |
| --- | --- |
| `New` | Create isolated group |
| `List` | Created group visible; stopped group reports Idle |
| `GET {id}` | Single-group identity and both members |
| `Join` | Join and late rejoin; denied/missing-group handling |
| `Leave` | Solo continuation; disconnected member removed |
| `SetNewQueue` | Both clients launch queue and synchronize |
| `Queue` | Append and Play Next preserve current playback; duplicate media has distinct playlist IDs |
| `MovePlaylistItem` | Shared ordering changes while current identity remains |
| `RemoveFromPlaylist` | Remove one duplicate; clear upcoming items; clear all and stop |
| `SetPlaylistItem` | Both clients launch selected playlist entry |
| `NextItem` | Shared next; repeat-one restart; repeat-all wrap |
| `PreviousItem` | Shared previous; repeat-one restart; repeat-all wrap |
| `SetRepeatMode` | Off/one/all shared state; repeated EOF restart, wrap, or Stop |
| `SetShuffleMode` | Shuffle preserves media set/current identity; Sorted restores order |
| `Pause` | Guest pauses host with synchronized positions |
| `Unpause` | Host resumes both clients |
| `Seek` | Paused seek stays paused; playing seek resumes after Ready |
| `Stop` | Both decoders close; group Idle with membership retained |
| `Buffering` | Ready members pause and group waits |
| `Ready` | Group resumes when barrier clears; recovering member catches up |
| `SetIgnoreWait` | True releases waiting group while member buffers; false restores barrier |
| `Ping` | Controller latency reports accepted during clock synchronization |

Endpoint names above use `/SyncPlay/` and POST unless marked GET; `List` also uses GET. `endpointCoverage` and `requests` in the JSON provide per-endpoint counts and scenario names. EOF in this harness comes from simulated decoder completion; actual presented NativePlayer EOF evidence is recorded in the platform tables above. Repeat-one explicit Next/Previous restart the current entry, matching Jellyfin server behavior. Repeat-off final EOF sends Stop because the server's final Next request is a no-op.

The 22-endpoint count covers REST actions. Incoming WebSocket `SyncPlayGroupUpdate` and `SyncPlayCommand` separately carry canonical membership/queue/mode state and scheduled playback commands; `ForceKeepAlive` keeps the background transport alive. Controller/unit coverage verifies clock correction, obsolete-command cancellation and disconnect behavior; actual native rounds verify received play/pause/seek/Stop commands and queue transitions. Native scheduling and HTTP playback-report ordering are independently covered by the native/JavaScript checks above.

Generated credentials, media, logs, and evidence are ignored by Git. No physical device, release build, store submission, or deployment was performed.
