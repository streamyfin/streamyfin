// Must be first: switches NativeWind to style-object output on web before
// expo-router mounts any styled component. See the file for why.
import "./nativewind-web-output";
import "react-native-url-polyfill/auto";
import { Platform } from "react-native";
import "expo-router/entry";

// TrackPlayer is not supported on tvOS or on web (desktop)
if (!Platform.isTV && Platform.OS !== "web") {
  const TrackPlayer = require("react-native-track-player").default;
  const { PlaybackService } = require("./services/PlaybackService");
  TrackPlayer.registerPlaybackService(() => PlaybackService);
}
