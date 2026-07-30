import * as React from "react";
import type { MpvPlayerViewProps, MpvPlayerViewRef } from "@/modules";
import { MpvPlayerView } from "@/modules";
import { ExoPlayerView } from "@/modules/exoplayer-player";
import {
  getActiveVideoPlayer,
  useSettings,
  VideoPlayer,
} from "@/utils/atoms/settings";

/**
 * Unified video player view. MPV is the default on every platform; users
 * can opt into ExoPlayer on Android TV via settings.videoPlayer. Both
 * children conform to the same `MpvPlayerViewRef` interface, so the ref
 * is forwarded transparently regardless of which player is rendered.
 *
 * The Android-TV capability gate lives in getActiveVideoPlayer so that
 * the same resolver used for device-profile advertisement guarantees the
 * rendered backend matches what Jellyfin was told to stream for.
 */
export const VideoPlayerView = React.forwardRef<
  MpvPlayerViewRef,
  MpvPlayerViewProps
>(function VideoPlayerView(props, ref) {
  const { settings } = useSettings();
  const useExo = getActiveVideoPlayer(settings) === VideoPlayer.ExoPlayer;

  const Player = useExo ? ExoPlayerView : MpvPlayerView;
  return <Player ref={ref} {...props} />;
});
