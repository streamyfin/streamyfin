`engine-agnostic-native-chrome` | The native chrome holds a ChromeEngine and reaches rendering through a cast; engine comes from config.engine, an unknown one is refused

The native player chrome on Android (NativePlayerSession + PlayerViewModel +
Compose UI in modules/mpv-player; Android TV, and phones with the Native
video player) never touches MPV directly — it consumes the
`PlayerEngine` interface (nativeplayer/engine/PlayerEngine.kt). Which engine is
built comes from `PlayerPresentConfigRecord.engine` ("mpv" default, "exoplayer"),
which buildNativePlayerConfig sets from `getActivePlayerType` — the same resolver
that picks the Jellyfin device profile. Consequences:

- The engine setting (settings.videoPlayer) and the native-controls toggle
  (nativeVideoPlayerAndroidTV) are independent axes; the toggle must never
  change the engine.
- getActivePlayerType/getActiveVideoPlayerEngine are ENGINE resolvers (never
  return VideoPlayer.Native); getActiveVideoPlayer/isNativeChromeActive are the
  renderer/routing resolvers. VideoPlayerView must select by the ENGINE
  resolver — it also renders on native-decline paths (Live TV, present
  failure) where the engine choice still applies.
- ExoPlayerEngine is the Media3 engine (media3 deps live in mpv-player's
  build.gradle, pinned to react-native-track-player's media3Version). All its
  Player access must happen on the main looper — the module's propsHandler
  reads track lists / technical info from cached snapshots, and setters post.
- mpv-only engine calls (volume boost, dialogue boost, mono downmix,
  audio/subtitle delay, alignX, assOverride) are interface no-ops on Exo; the
  chrome hides those rows via PlayerViewModel.isMpvEngine.
- `PlayerEngine` is the union of three faces (2026-10-28): `TransportEngine`
  (playback, seeking, speed, tracks, state, the delegate), `RenderingEngine`
  (surface, subtitle rendering, zoom, technical info, video size) and
  `QueueEngine` (current item, next, previous, enqueue, the target's volume;
  defaults for the local engines). iOS has the same three protocols in
  `PlayerEngineProtocols.swift`, with `PlayerEngine = TransportEngine &
  RenderingEngine & QueueEngine` and the delegate typed on the transport face.
  A remote engine (Cast, later Play On and AirPlay) implements transport and
  queue only.
- The chrome holds a `ChromeEngine` on both platforms (2026-11-04): Kotlin
  `interface ChromeEngine : TransportEngine, QueueEngine`, Swift `typealias
  ChromeEngine = TransportEngine & QueueEngine`. A local engine is still a
  `PlayerEngine`; a remote one is a `ChromeEngine` only. The session, the view
  model and, on iOS, the view controller reach rendering through a private
  `rendering` (`engine as? RenderingEngine`): without a screen those calls do
  nothing. Views ask the view model (`canPictureInPicture`, `technicalInfo`),
  never the engine. The technical info rule is a pure function on each side,
  `technicalInfoOf` (Kotlin) and `readTechnicalInfo(from:)` (Swift, beside
  `pictureInPictureSupported(by:)`), under test: no screen means an empty table,
  still answered, so the overlay clears and the JS promise settles.
- An engine name the platform does not build is refused at `presentPlayer`
  with `ERR_UNSUPPORTED_ENGINE` (`NativeEngineKind`: mpv and exoplayer on
  Android, mpv on iOS; no name means mpv), and the JS player takes over. Before,
  an unknown name ran mpv. The engine is built by an exhaustive `when`/`switch`
  over the kind (`NativePlayerSession.createEngine` on Android,
  `NativePlayerModule.makeEngine` on iOS), so a kind added later does not
  compile until it is built.
