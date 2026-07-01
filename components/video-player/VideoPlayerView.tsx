import * as React from "react";
import { Platform } from "react-native";
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
 */
export const VideoPlayerView = React.forwardRef<
  MpvPlayerViewRef,
  MpvPlayerViewProps
>(function VideoPlayerView(props, ref) {
  const { settings } = useSettings();

  // ExoPlayer's native module only ships for Android TV. Even if a user
  // somehow ends up with `videoPlayer: ExoPlayer` set on another platform
  // (shouldn't happen — the selector is hidden outside Android TV — but
  // MMKV-persisted settings can roam), fall back to MPV rather than
  // crash on requireNativeView().
  const isExoSupported = Platform.OS === "android" && Platform.isTV;
  const useExo =
    isExoSupported && getActiveVideoPlayer(settings) === VideoPlayer.ExoPlayer;

  const Player = useExo ? ExoPlayerView : MpvPlayerView;
  return <Player ref={ref} {...props} />;
});
