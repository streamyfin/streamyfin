import { EventEmitter } from "eventemitter3";

/**
 * Which player the native audio player (react-native-track-player) is
 * playing for. Music and audiobooks share the one native player and its
 * queue: whoever starts playback claims it, and the other lets go of what it
 * had, so a song's handlers never act on a book's track or the other way.
 *
 * Module state and not React state: the playback service reads it, and it
 * runs without a React tree on Android once the app is swiped away.
 */
export type AudioOwner = "music" | "audiobook";

let owner: AudioOwner | null = null;

const emitter = new EventEmitter<{
  change: (next: AudioOwner, previous: AudioOwner | null) => void;
}>();

export const getAudioOwner = (): AudioOwner | null => owner;

/**
 * Takes the native player for `next`, returning who had it. Listeners hear of
 * a change of owner before this returns, so the previous owner lets go before
 * the new one touches the native queue.
 */
export const claimAudioOwner = (next: AudioOwner): AudioOwner | null => {
  const previous = owner;
  owner = next;
  if (previous !== next) emitter.emit("change", next, previous);
  return previous;
};

/** Gives the player up, when what owned it stopped. */
export const releaseAudioOwner = (current: AudioOwner) => {
  if (owner === current) owner = null;
};

export const onAudioOwnerChange = (
  listener: (next: AudioOwner, previous: AudioOwner | null) => void,
) => {
  emitter.on("change", listener);
  return () => {
    emitter.off("change", listener);
  };
};
