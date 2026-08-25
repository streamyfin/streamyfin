import type {
  AutoSubtitlePick,
  AutoSubtitleTrackIdentity,
} from "./jellyfin/subtitleUtils";
import { sameSubtitleTrack } from "./jellyfin/subtitleUtils";
import { SUBTITLES_OFF } from "./subtitles/subtitleIndex";

export type AutoSubtitleState = {
  /** Index this feature switched on, null when it did not act. */
  appliedIndex: number | null;
  /**
   * Identity of the track at `appliedIndex`. Kept because the index alone
   * stops meaning anything once the item changes, see `carriedTrack`.
   */
  appliedTrack: AutoSubtitleTrackIdentity | null;
  /**
   * Set once the user picked a subtitle themselves after we acted. The feature
   * then stays out of the way until the next item starts.
   */
  released: boolean;
  /**
   * The previous item ended with a subtitle this feature had switched on, and
   * the sound was still muted when it ended.
   *
   * The app carries the subtitle selection over to the next episode
   * (`rememberSubtitleSelections`, mirroring jellyfin-web's `autoSetNextTracks`),
   * so the new item can start with that track already active. Without this
   * the feature would see a subtitle it did not apply, keep its hands off,
   * and never turn it back off when the sound returned — leaving subtitles on
   * for good.
   *
   * Held as an identity rather than an index: the carry-over matches by
   * language through `StreamRanker`, so the same track routinely lands on a
   * different `MediaStream.Index` in the next episode. Comparing identities is
   * also what keeps a subtitle the user picked in the meantime from being
   * mistaken for ours and undone on unmute.
   */
  carriedTrack: AutoSubtitleTrackIdentity | null;
};

export type AutoSubtitleAction =
  | { kind: "none" }
  | { kind: "apply"; index: number }
  | { kind: "revert" }
  | { kind: "notice"; reason: "restart-required" | "none" };

export const INITIAL_AUTO_SUBTITLE_STATE: AutoSubtitleState = {
  appliedIndex: null,
  appliedTrack: null,
  released: false,
  carriedTrack: null,
};

/**
 * State to start the next item with. Ownership of the active subtitle is
 * carried over only when this feature applied it and the sound is still muted,
 * so an adopted track stays ours to undo once the sound returns.
 */
export const carryAutoSubtitleState = (
  state: AutoSubtitleState,
  { isMuted }: { isMuted: boolean },
): AutoSubtitleState => ({
  appliedIndex: null,
  appliedTrack: null,
  released: false,
  carriedTrack:
    isMuted && state.appliedIndex !== null && !state.released
      ? state.appliedTrack
      : null,
});

type Resolution = { action: AutoSubtitleAction; state: AutoSubtitleState };

const nothing = (state: AutoSubtitleState): Resolution => ({
  action: { kind: "none" },
  state,
});

/** The mute state did not change since the last evaluation. */
const resolveSteady = (
  state: AutoSubtitleState,
  isMuted: boolean,
  currentSubtitleIndex: number,
  currentTrack: AutoSubtitleTrackIdentity | null,
): Resolution => {
  // The user overrode our choice without the mute state changing: hands off
  // until the next item, so we never fight them over the track list.
  if (
    state.appliedIndex !== null &&
    currentSubtitleIndex !== state.appliedIndex
  ) {
    return nothing({ ...INITIAL_AUTO_SUBTITLE_STATE, released: true });
  }

  // The sound came back on a new item before the carried-over track was ever
  // adopted, so no mute transition will happen to undo it. Undo it here: it was
  // ours, as long as what is showing is still the track we carried.
  if (!isMuted && state.carriedTrack) {
    const stillOurs =
      currentSubtitleIndex !== SUBTITLES_OFF &&
      sameSubtitleTrack(currentTrack, state.carriedTrack);
    return {
      action: stillOurs ? { kind: "revert" } : { kind: "none" },
      state: INITIAL_AUTO_SUBTITLE_STATE,
    };
  }

  return nothing(state);
};

/** The sound was just cut. */
const resolveOnMute = (
  state: AutoSubtitleState,
  currentSubtitleIndex: number,
  currentTrack: AutoSubtitleTrackIdentity | null,
  pick: () => AutoSubtitlePick,
): Resolution => {
  if (currentSubtitleIndex !== SUBTITLES_OFF) {
    // A track we applied on the previous item was carried over: adopt it so the
    // sound coming back still turns it off. Nothing to apply, it already shows.
    // Anything else showing is the user's own pick and stays theirs.
    return state.carriedTrack &&
      sameSubtitleTrack(currentTrack, state.carriedTrack)
      ? nothing({
          appliedIndex: currentSubtitleIndex,
          appliedTrack: currentTrack,
          released: false,
          carriedTrack: null,
        })
      : nothing(state);
  }

  const picked = pick();
  if (picked.index === null) {
    return { action: { kind: "notice", reason: picked.reason }, state };
  }
  return {
    action: { kind: "apply", index: picked.index },
    state: {
      appliedIndex: picked.index,
      appliedTrack: picked.track,
      released: false,
      carriedTrack: null,
    },
  };
};

/** The sound just came back: only undo what we did, and only if it still shows. */
const resolveOnUnmute = (
  state: AutoSubtitleState,
  currentSubtitleIndex: number,
): Resolution => ({
  action:
    state.appliedIndex !== null && currentSubtitleIndex === state.appliedIndex
      ? { kind: "revert" }
      : { kind: "none" },
  state: INITIAL_AUTO_SUBTITLE_STATE,
});

/**
 * Decide what the player should do given a mute transition.
 *
 * Pure on purpose: the whole policy is unit-tested without React, a device or a
 * player, and both the JS player controls and the fully-native player run the
 * same rules through it. The caller only feeds it debounced input and performs
 * the action.
 */
export const resolveAutoSubtitleAction = (params: {
  state: AutoSubtitleState;
  isMuted: boolean;
  wasMuted: boolean;
  currentSubtitleIndex: number;
  /** Identity of the subtitle at `currentSubtitleIndex`, null when off. */
  currentTrack: AutoSubtitleTrackIdentity | null;
  pick: () => AutoSubtitlePick;
}): Resolution => {
  const { state, isMuted, wasMuted, currentSubtitleIndex, currentTrack, pick } =
    params;

  if (state.released) return nothing(state);
  if (isMuted === wasMuted) {
    return resolveSteady(state, isMuted, currentSubtitleIndex, currentTrack);
  }
  return isMuted
    ? resolveOnMute(state, currentSubtitleIndex, currentTrack, pick)
    : resolveOnUnmute(state, currentSubtitleIndex);
};
