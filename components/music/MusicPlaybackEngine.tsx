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
import { writeErrorLog } from "@/utils/log";

// Mounted once the player is ready: these hooks read the native state a single
// time on mount and swallow the rejection when there is no player.
const MusicPlaybackPolling: React.FC = () => {
  const { position, duration } = useProgress(1000);
  const playbackState = usePlaybackState();
  const activeTrack = useActiveTrack();
  const {
    setProgress,
    setDuration,
    setIsPlaying,
    reportProgress,
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

  return null;
};

// The listeners need no player and must exist before the first track is added,
// or the first track change is missed.
export const MusicPlaybackEngine: React.FC = () => {
  const { isPlayerReady, onTrackEnd, triggerLookahead } = useMusicPlayer();
  // Each track load bumps it: a stream is played again once per load.
  const trackLoadRef = useRef(0);
  const replayedLoadRef = useRef(-1);

  // Listen for track changes (native -> JS)
  // This triggers look-ahead caching, checks for cached versions, and handles track end
  useEffect(() => {
    const subscription =
      TrackPlayer.addEventListener<PlaybackActiveTrackChangedEvent>(
        Event.PlaybackActiveTrackChanged,
        async (event) => {
          trackLoadRef.current += 1;
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

  // Listen for playback errors: replay a stream once, drop a corrupted cache file
  useEffect(() => {
    const subscription = TrackPlayer.addEventListener(
      Event.PlaybackError,
      async (event) => {
        const load = trackLoadRef.current;
        const activeTrack = await TrackPlayer.getActiveTrack();
        if (!activeTrack?.url) return;

        const url = activeTrack.url as string;
        if (!url.startsWith("file://")) {
          const playWhenReady = await TrackPlayer.getPlayWhenReady();
          writeErrorLog("[MusicPlayer] Playback error for stream", {
            trackId: activeTrack.id,
            playWhenReady,
            event,
          });
          // A seek right after a load can fail the decoding (FLAC LOST_SYNC).
          // play() reloads a failed item at its position, as a second tap does;
          // a paused track stays paused, and a track loaded meanwhile is not
          // this error's.
          if (
            !playWhenReady ||
            load !== trackLoadRef.current ||
            replayedLoadRef.current === load
          )
            return;
          replayedLoadRef.current = load;
          await TrackPlayer.play().catch((error) =>
            writeErrorLog(
              "[MusicPlayer] Replay after a playback error failed",
              error,
            ),
          );
          return;
        }

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
  return isPlayerReady ? <MusicPlaybackPolling /> : null;
};
