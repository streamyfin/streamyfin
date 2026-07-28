// Re-export the shared player contract from mpv-player so ExoPlayer
// and MPV present identical surfaces to React. The MPV-prefixed setting
// keys keep their names to avoid migrating existing installs.
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
export { default as ExoPlayerView } from "./src/ExoPlayerView";
