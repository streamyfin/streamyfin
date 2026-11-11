import { Platform } from "react-native";
import "expo-router/entry";

// TrackPlayer is not supported on tvOS
if (!Platform.isTV) {
  const TrackPlayer = require("react-native-track-player").default;
  TrackPlayer.registerPlaybackService(
    () => require("./services/PlaybackService").PlaybackService,
  );
}
