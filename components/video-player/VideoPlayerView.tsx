import * as React from "react";
import type { MpvPlayerViewProps, MpvPlayerViewRef } from "@/modules";
import { MpvPlayerView } from "@/modules";
import { ExoPlayerView } from "@/modules/exoplayer-player";
import {
  getActiveVideoPlayerEngine,
  useSettings,
  VideoPlayer,
} from "@/utils/atoms/settings";

/**
 * Unified video player view for the JS route. MPV is the default on every
 * platform; users can opt into ExoPlayer on Android TV via
 * settings.videoPlayer. Both children conform to the same
 * `MpvPlayerViewRef` interface, so the ref is forwarded transparently
 * regardless of which player is rendered.
 *
 * Resolves by ENGINE (getActiveVideoPlayerEngine), not by renderer: this
 * view only mounts when the native chrome is off OR declined (Live TV,
 * present failure), and in both cases the selected engine is what must
 * render and what Jellyfin was told to stream for.
 */
export const VideoPlayerView = React.forwardRef<
  MpvPlayerViewRef,
  MpvPlayerViewProps
>(function VideoPlayerView(props, ref) {
  const { settings } = useSettings();
  const useExo = getActiveVideoPlayerEngine(settings) === VideoPlayer.ExoPlayer;

  const Player = useExo ? ExoPlayerView : MpvPlayerView;
  return <Player ref={ref} {...props} />;
});
