// Web (desktop) variant. ExoPlayer is Android-only; on desktop both player
// surfaces collapse onto the same HTML5 <video> implementation, which already
// satisfies the shared MpvPlayerViewRef contract.
export { MpvPlayerView as ExoPlayerView } from "../mpv-player/index.web";
export type {
  AudioTrack,
  MpvPlayerViewProps,
  MpvPlayerViewRef,
  NowPlayingMetadata,
  OnErrorEventPayload,
  OnLoadEventPayload,
  OnPictureInPictureChangePayload,
  OnPlaybackStateChangePayload,
  OnProgressEventPayload,
  OnTracksReadyEventPayload,
  SubtitleTrack,
  TechnicalInfo,
  VideoSource,
} from "../mpv-player/src/MpvPlayer.types";
