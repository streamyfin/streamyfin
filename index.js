import "react-native-url-polyfill/auto";
import TrackPlayer from "react-native-track-player";
import { PlaybackService } from "./services/PlaybackService";
import "expo-router/entry";

TrackPlayer.registerPlaybackService(() => PlaybackService);
