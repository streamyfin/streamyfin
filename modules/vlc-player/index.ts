import {
  EventEmitter,
  EventSubscription,
} from "expo-modules-core";

import VlcPlayerModule from "./src/VlcPlayerModule";
import VlcPlayerView from "./src/VlcPlayerView";
import {
  PlaybackStatePayload,
  ProgressUpdatePayload,
  VideoLoadStartPayload,
  VideoStateChangePayload,
  VideoProgressPayload,
  VlcPlayerSource,
  TrackInfo,
  ChapterInfo,
  VlcPlayerViewProps,
  VlcPlayerViewRef,
} from "./src/VlcPlayer.types";

const emitter = new EventEmitter(VlcPlayerModule);

export function addPlaybackStateListener(
  listener: (event: PlaybackStatePayload) => void
): EventSubscription {
  return emitter.addListener<PlaybackStatePayload>(
    "onPlaybackStateChanged",
    listener
  );
}

export function addVideoLoadStartListener(
  listener: (event: VideoLoadStartPayload) => void
): EventSubscription {
  return emitter.addListener<VideoLoadStartPayload>(
    "onVideoLoadStart",
    listener
  );
}

export function addVideoStateChangeListener(
  listener: (event: VideoStateChangePayload) => void
): EventSubscription {
  return emitter.addListener<VideoStateChangePayload>(
    "onVideoStateChange",
    listener
  );
}

export function addVideoProgressListener(
  listener: (event: VideoProgressPayload) => void
): EventSubscription {
  return emitter.addListener<VideoProgressPayload>("onVideoProgress", listener);
}

export {
  VlcPlayerView,
  VlcPlayerViewProps,
  VlcPlayerViewRef,
  PlaybackStatePayload,
  ProgressUpdatePayload,
  VideoLoadStartPayload,
  VideoStateChangePayload,
  VideoProgressPayload,
  VlcPlayerSource,
  TrackInfo,
  ChapterInfo,
};
