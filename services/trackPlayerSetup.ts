import { Platform } from "react-native";

// The native module does not exist on TV, same guard as MusicPlayerProvider.
const TrackPlayer = Platform.isTV
  ? null
  : require("react-native-track-player").default;

let setup: Promise<void> | null = null;

/**
 * Sets up the native audio player once, for music and audiobooks alike.
 *
 * Shared because the two must never call setupPlayer at the same time: on
 * Android a second call while the first is still binding `MusicService`
 * replaces the promise the first one waits on, which then never settles
 * (MusicModule.setupPlayer keeps a single `playerSetUpPromise`). A failed
 * setup clears the memo so the next caller tries again.
 */
export const ensureTrackPlayerSetup = (): Promise<void> => {
  if (!TrackPlayer) return Promise.resolve();
  if (setup) return setup;

  const attempt = (async () => {
    try {
      await TrackPlayer.setupPlayer({
        minBuffer: 120, // Minimum 2 minutes buffer for network resilience
        maxBuffer: 240, // Maximum 4 minutes buffer
        playBuffer: 5, // Start playback after 5 seconds buffered
        backBuffer: 30, // Keep 30 seconds behind for seeking
      });
    } catch (error) {
      // A JS reload with the native module alive means the player exists.
      // On an Android relaunch that finds `MusicService` still running, a new
      // `MusicModule` instance gets a resolve from `onServiceConnected`, and
      // only a surviving instance gets `player_already_initialized`. Both
      // mean the player exists.
      if (
        (error as { code?: string } | null)?.code !==
        "player_already_initialized"
      ) {
        throw error;
      }
    }
  })();
  setup = attempt.catch((error) => {
    setup = null;
    throw error;
  });
  return setup;
};

/** For specs that start each test with a native player that was never set up. */
export const resetTrackPlayerSetupForTests = () => {
  setup = null;
};
