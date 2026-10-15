import TrackPlayer, { Event } from "react-native-track-player";
import {
  applyMusicNormalization,
  setMusicNormalizationTrack,
} from "@/services/MusicNormalization";

export const PlaybackService = async () => {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());

  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());

  TrackPlayer.addEventListener(Event.RemoteNext, () =>
    TrackPlayer.skipToNext(),
  );

  TrackPlayer.addEventListener(Event.RemotePrevious, () =>
    TrackPlayer.skipToPrevious(),
  );

  TrackPlayer.addEventListener(Event.RemoteSeek, (event) =>
    TrackPlayer.seekTo(event.position),
  );

  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.reset());

  // Volume normalization is driven from here and not from a component: this
  // service lives as long as the player, and Android keeps playing the queue
  // after the app is swiped away and the React tree is gone.
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event) => {
    if (event.track) setMusicNormalizationTrack(event.track);
  });

  // After a failure iOS builds a new native player, which starts at full
  // volume, and resuming the same track raises no track change to set it from.
  TrackPlayer.addEventListener(Event.PlaybackState, applyMusicNormalization);
};
