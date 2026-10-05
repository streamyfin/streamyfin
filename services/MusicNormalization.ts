import { Platform } from "react-native";
import type { Track } from "react-native-track-player";
import {
  DEFAULT_MUSIC_NORMALIZATION_MODE,
  type MusicNormalizationMode,
} from "@/constants/Music";
import {
  getNormalizationVolume,
  type TrackNormalizationGains,
} from "@/utils/music/normalization";

// The native module does not exist on TV, same guard as MusicPlayerProvider.
const TrackPlayer = Platform.isTV
  ? null
  : require("react-native-track-player").default;

// Module state and not React state: the playback service that drives this
// runs without a React tree, and keeps running after the tree is gone.
let mode: MusicNormalizationMode = DEFAULT_MUSIC_NORMALIZATION_MODE;
// The gains of the track that last became active, undefined until one has.
let activeGains: TrackNormalizationGains | undefined;

/**
 * Sets the player volume for the active track. The player volume belongs to
 * normalization alone: the volume the user sets is the system one, which
 * scales the output after this.
 */
const setPlayerVolume = () => {
  // Nothing has played yet, so there may be no player to set a volume on.
  if (!TrackPlayer || !activeGains) return;
  TrackPlayer.setVolume(getNormalizationVolume(activeGains, mode)).catch(() => {
    // The player was torn down; the next track to start sets it again.
  });
};

/** Changing the mode takes effect on the track that is already playing. */
export const setMusicNormalizationMode = (next: MusicNormalizationMode) => {
  mode = next;
  setPlayerVolume();
};

/** Call when a track becomes active, or just before it is handed over. */
export const setMusicNormalizationTrack = (track: Track) => {
  // Custom fields on the queued track, which the player types as `any`.
  activeGains = {
    normalizationGain: track.normalizationGain,
    albumNormalizationGain: track.albumNormalizationGain,
  };
  if (mode !== "off") setPlayerVolume();
};

/** Sets the volume again, for when the native player may have lost it. */
export const applyMusicNormalization = () => {
  // While off the volume is never lowered, so there is nothing to restore.
  if (mode !== "off") setPlayerVolume();
};
