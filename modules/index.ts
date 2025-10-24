import type {
  ChapterInfo,
  PlaybackStatePayload,
  ProgressUpdatePayload,
  TrackInfo,
  VideoLoadStartPayload,
  VideoProgressPayload,
  VideoStateChangePayload,
  VlcPlayerSource,
  VlcPlayerViewProps,
  VlcPlayerViewRef,
} from "./VlcPlayer.types";
import VlcPlayerView from "./VlcPlayerView";

// Component
export { VlcPlayerView };

// Component Types
export type { VlcPlayerViewProps, VlcPlayerViewRef };

// Media Types
export type { ChapterInfo, TrackInfo, VlcPlayerSource };

// Playback Events (alphabetically sorted)
export type {
  PlaybackStatePayload,
  ProgressUpdatePayload,
  VideoLoadStartPayload,
  VideoProgressPayload,
  VideoStateChangePayload,
};
