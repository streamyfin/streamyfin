import { useEffect, useRef } from "react";
import TrackPlayer, {
  Event,
  type PlaybackActiveTrackChangedEvent,
  State,
  useActiveTrack,
  usePlaybackState,
  useProgress,
} from "react-native-track-player";
import {
  audioStorageEvents,
  deleteTrack,
  getLocalPath,
} from "@/providers/AudioStorage";
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
    triggerLookahead,
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

  // Listen for track changes (native -> JS)
  // This triggers look-ahead caching, checks for cached versions, and handles track end
  useEffect(() => {
    const subscription =
      TrackPlayer.addEventListener<PlaybackActiveTrackChangedEvent>(
        Event.PlaybackActiveTrackChanged,
        async (event) => {
          // Trigger look-ahead caching when a new track starts playing
          if (event.track) {
            triggerLookahead();

            // Check if there's a cached version we should use instead
            const trackId = event.track.id;
            const currentUrl = event.track.url as string;

            // Only check if currently using a remote URL
            if (trackId && currentUrl && !currentUrl.startsWith("file://")) {
              const cachedPath = getLocalPath(trackId);
              if (cachedPath) {
                console.log(
                  `[AudioCache] Switching to cached version for ${trackId}`,
                );
                try {
                  // Load the cached version, preserving position if any
                  const currentIndex = await TrackPlayer.getActiveTrackIndex();
                  if (currentIndex !== undefined && currentIndex >= 0) {
                    const queue = await TrackPlayer.getQueue();
                    const track = queue[currentIndex];
                    // Remove and re-add with cached URL
                    await TrackPlayer.remove(currentIndex);
                    await TrackPlayer.add(
                      { ...track, url: cachedPath },
                      currentIndex,
                    );
                    await TrackPlayer.skip(currentIndex);
                    await TrackPlayer.play();
                  }
                } catch (error) {
                  console.warn(
                    "[AudioCache] Failed to switch to cached version:",
                    error,
                  );
                }
              }
            }
          }

          // If there's no next track and the previous track ended, call onTrackEnd
          if (event.lastTrack && !event.track) {
            onTrackEnd();
          }
        },
      );

    return () => subscription.remove();
  }, [onTrackEnd, triggerLookahead]);

  // Listen for audio cache download completion and update queue URLs
  useEffect(() => {
    const onComplete = async ({
      itemId,
      localPath,
    }: {
      itemId: string;
      localPath: string;
    }) => {
      console.log(`[AudioCache] Track ${itemId} cached successfully`);

      try {
        const queue = await TrackPlayer.getQueue();
        const currentIndex = await TrackPlayer.getActiveTrackIndex();

        // Find the track in the queue
        const trackIndex = queue.findIndex((t) => t.id === itemId);

        // Only update if track is in queue and not currently playing
        if (trackIndex >= 0 && trackIndex !== currentIndex) {
          const track = queue[trackIndex];
          const localUrl = localPath.startsWith("file://")
            ? localPath
            : `file://${localPath}`;

          // Skip if already using local URL
          if (track.url === localUrl) return;

          console.log(
            `[AudioCache] Updating queue track ${trackIndex} to use cached file`,
          );

          // Remove old track and insert updated one at same position
          await TrackPlayer.remove(trackIndex);
          await TrackPlayer.add({ ...track, url: localUrl }, trackIndex);
        }
      } catch (error) {
        console.warn("[AudioCache] Failed to update queue:", error);
      }
    };

    audioStorageEvents.on("complete", onComplete);
    return () => {
      audioStorageEvents.off("complete", onComplete);
    };
  }, []);

  // Listen for playback errors (corrupted cache files)
  useEffect(() => {
    const subscription = TrackPlayer.addEventListener(
      Event.PlaybackError,
      async (event) => {
        const activeTrack = await TrackPlayer.getActiveTrack();
        if (!activeTrack?.url) return;

        // Only handle local file errors
        const url = activeTrack.url as string;
        if (!url.startsWith("file://")) return;

        console.warn(
          `[MusicPlayer] Playback error for cached file: ${activeTrack.id}`,
          event,
        );

        // Delete corrupted cache file
        if (activeTrack.id) {
          try {
            await deleteTrack(activeTrack.id);
            console.log(
              `[MusicPlayer] Deleted corrupted cache file: ${activeTrack.id}`,
            );
          } catch (error) {
            console.warn(
              "[MusicPlayer] Failed to delete corrupted file:",
              error,
            );
          }
        }

        // Skip to next track
        try {
          await TrackPlayer.skipToNext();
        } catch {
          // No next track available, stop playback
          await TrackPlayer.stop();
        }
      },
    );

    return () => subscription.remove();
  }, []);

  // No visual component needed - TrackPlayer is headless
  return null;
};
