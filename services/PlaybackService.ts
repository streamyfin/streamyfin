import { Platform } from "react-native";

// TrackPlayer is not available on tvOS - wrap in try-catch in case native module isn't linked
let TrackPlayer: typeof import("react-native-track-player").default | null =
  null;
let Event: typeof import("react-native-track-player").Event | null = null;
if (!Platform.isTV) {
  try {
    TrackPlayer = require("react-native-track-player").default;
    Event = require("react-native-track-player").Event;
  } catch (e) {
    console.warn("TrackPlayer not available:", e);
  }
}

export const PlaybackService = async () => {
  // TrackPlayer is not supported on tvOS
  if (Platform.isTV || !TrackPlayer || !Event) return;

  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());

  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());

  TrackPlayer.addEventListener(Event.RemoteNext, () =>
    TrackPlayer.skipToNext(),
  );

  TrackPlayer.addEventListener(Event.RemotePrevious, () =>
    TrackPlayer.skipToPrevious(),
  );

  TrackPlayer.addEventListener(
    Event.RemoteSeek,
    (event: { position: number }) => TrackPlayer.seekTo(event.position),
  );

  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.reset());
};
