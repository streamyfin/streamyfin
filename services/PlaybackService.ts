import TrackPlayer, { Event, State } from "react-native-track-player";
import {
  handleAudiobookPlaybackState,
  handleAudiobookProgress,
  handleAudiobookRemoteJump,
  handleAudiobookRemoteSkip,
  handleAudiobookTrackChanged,
} from "@/services/AudiobookPlayback";
import { getAudioOwner } from "@/services/audioOwner";
import {
  applyMusicNormalization,
  setMusicNormalizationTrack,
} from "@/services/MusicNormalization";

// A spec's double of the module may not carry the enum.
const PLAYING = State?.Playing ?? "playing";

const playingBook = () => getAudioOwner() === "audiobook";

export const PlaybackService = async () => {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());

  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());

  // A book's parts are queued natively, so next and previous would jump a
  // whole file: they move by chapter instead.
  TrackPlayer.addEventListener(Event.RemoteNext, () =>
    playingBook()
      ? handleAudiobookRemoteSkip("next")
      : TrackPlayer.skipToNext(),
  );

  TrackPlayer.addEventListener(Event.RemotePrevious, () =>
    playingBook()
      ? handleAudiobookRemoteSkip("previous")
      : TrackPlayer.skipToPrevious(),
  );

  TrackPlayer.addEventListener(Event.RemoteJumpForward, (event) =>
    handleAudiobookRemoteJump(event.interval),
  );

  TrackPlayer.addEventListener(Event.RemoteJumpBackward, (event) =>
    handleAudiobookRemoteJump(-event.interval),
  );

  TrackPlayer.addEventListener(Event.RemoteSeek, (event) =>
    TrackPlayer.seekTo(event.position),
  );

  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.reset());

  // Volume normalization is driven from here and not from a component: this
  // service lives as long as the player, and Android keeps playing the queue
  // after the app is swiped away and the React tree is gone. The audiobook
  // sleep timer is driven from here for the same reason.
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event) => {
    if (event.track) setMusicNormalizationTrack(event.track);
    handleAudiobookTrackChanged(event.index);
  });

  // After a failure iOS builds a new native player, which starts at full
  // volume, and resuming the same track raises no track change to set it from.
  TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
    applyMusicNormalization();
    handleAudiobookPlaybackState(event?.state === PLAYING);
  });

  // Only sent while an audiobook plays: it sets the report interval.
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (event) =>
    handleAudiobookProgress(event),
  );
};
