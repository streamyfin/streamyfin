`engine-agnostic-native-chrome` | The native chrome consumes PlayerEngine, not mpv; engine comes from config.engine

The Android TV native player chrome (NativePlayerSession + PlayerViewModel +
Compose UI in modules/mpv-player) never touches MPV directly — it consumes the
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
  queue only. Today every engine the chrome holds is local and typed
  `PlayerEngine`; the remote mode will hold `TransportEngine & QueueEngine` and
  reach rendering members through a cast (`engine as? RenderingEngine`),
  treating their absence as "none". The iOS view model already reads picture in
  picture that way.
- A Swift file added to the module joins the Pods target only after the pods
  are installed again; until then xcodebuild fails on the types it declares.
