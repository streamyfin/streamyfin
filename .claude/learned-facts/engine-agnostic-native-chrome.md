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
