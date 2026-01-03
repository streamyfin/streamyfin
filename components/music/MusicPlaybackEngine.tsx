import { useEffect, useRef } from "react";
import TrackPlayer, {
  Event,
  type PlaybackActiveTrackChangedEvent,
  State,
  useActiveTrack,
  usePlaybackState,
  useProgress,
} from "react-native-track-player";
import { useMusicPlayer } from "@/providers/MusicPlayerProvider";

export const MusicPlaybackEngine: React.FC = () => {
  const { position, duration } = useProgress(1000);
  const playbackState = usePlaybackState();
  const activeTrack = useActiveTrack();
  const {
    setProgress,
    setDuration,
    setIsPlaying,
    reportProgress,
    onTrackEnd,
    syncFromTrackPlayer,
  } = useMusicPlayer();

  const lastReportedProgressRef = useRef(0);

  // Sync progress from TrackPlayer to our state
  useEffect(() => {
    if (position > 0) {
      setProgress(position);
    }
  }, [position, setProgress]);

  // Sync duration from TrackPlayer to our state
  useEffect(() => {
    if (duration > 0) {
      setDuration(duration);
    }
  }, [duration, setDuration]);

  // Sync playback state from TrackPlayer to our state
  useEffect(() => {
    const isPlaying = playbackState.state === State.Playing;
    setIsPlaying(isPlaying);
  }, [playbackState.state, setIsPlaying]);

  // Sync active track changes
  useEffect(() => {
    if (activeTrack) {
      syncFromTrackPlayer();
    }
  }, [activeTrack?.id, syncFromTrackPlayer]);

  // Report progress every ~10 seconds
  useEffect(() => {
    if (
      Math.floor(position) - Math.floor(lastReportedProgressRef.current) >=
      10
    ) {
      lastReportedProgressRef.current = position;
      reportProgress();
    }
  }, [position, reportProgress]);

  // Listen for track end
  useEffect(() => {
    const subscription =
      TrackPlayer.addEventListener<PlaybackActiveTrackChangedEvent>(
        Event.PlaybackActiveTrackChanged,
        async (event) => {
          // If there's no next track and the previous track ended, call onTrackEnd
          if (event.lastTrack && !event.track) {
            onTrackEnd();
          }
        },
      );

    return () => subscription.remove();
  }, [onTrackEnd]);

  // No visual component needed - TrackPlayer is headless
  return null;
};
