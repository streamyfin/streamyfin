import "react-native-url-polyfill/auto";
import { Platform } from "react-native";
import "expo-router/entry";

// TrackPlayer is not supported on tvOS - wrap in try-catch in case native module isn't linked
if (!Platform.isTV) {
  try {
    const TrackPlayer = require("react-native-track-player").default;
    const { PlaybackService } = require("./services/PlaybackService");
    TrackPlayer.registerPlaybackService(() => PlaybackService);
  } catch (e) {
    console.warn("TrackPlayer not available:", e);
  }
}
