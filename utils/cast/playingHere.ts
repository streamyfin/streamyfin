/**
 * The title the music player plays on this device, null when it plays nothing: what the output sheet's row
 * for this device names. Read when the sheet opens, from the player itself, so that a Cast button on screen
 * does not follow the music's progress. Loaded there and then too: nothing that renders the button needs the
 * player.
 */
export const musicPlayingHere = async (): Promise<string | null> => {
  try {
    const player = require("react-native-track-player");
    const [{ state }, track] = await Promise.all([
      player.default.getPlaybackState(),
      player.default.getActiveTrack(),
    ]);
    return state === player.State.Playing ? (track?.title ?? null) : null;
  } catch {
    // The player answers with an error until the music player first set it up: nothing plays then.
    return null;
  }
};
