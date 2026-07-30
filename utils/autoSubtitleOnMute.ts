import type { AutoSubtitlePick } from "@/utils/jellyfin/subtitleUtils";

/**
 * `-1` is the only index meaning "subtitles off". A server stream is `>= 0` and
 * a client-downloaded subtitle is `<= LOCAL_SUBTITLE_INDEX_START` (-100), so
 * anything other than -1 means something is already showing. See
 * `components/video-player/controls/types.ts`.
 */
const SUBTITLES_OFF = -1;

export type AutoSubtitleState = {
  /** Index this feature switched on, null when it did not act. */
  appliedIndex: number | null;
  /**
   * Set once the user picked a subtitle themselves after we acted. The feature
   * then stays out of the way until the next item starts.
   */
  released: boolean;
};

export type AutoSubtitleAction =
  | { kind: "none" }
  | { kind: "apply"; index: number }
  | { kind: "revert" }
  | { kind: "notice"; reason: "restart-required" | "none" };

export const INITIAL_AUTO_SUBTITLE_STATE: AutoSubtitleState = {
  appliedIndex: null,
  released: false,
};

/**
 * Decide what the player should do given a mute transition.
 *
 * Pure on purpose: the whole policy is unit-tested without React, a device or a
 * player. The caller only feeds it debounced input and performs the action.
 */
export const resolveAutoSubtitleAction = (params: {
  state: AutoSubtitleState;
  isMuted: boolean;
  wasMuted: boolean;
  currentSubtitleIndex: number;
  pick: () => AutoSubtitlePick;
}): { action: AutoSubtitleAction; state: AutoSubtitleState } => {
  const { state, isMuted, wasMuted, currentSubtitleIndex, pick } = params;

  if (state.released) return { action: { kind: "none" }, state };

  if (isMuted === wasMuted) {
    // The user overrode our choice without the mute state changing: hands off
    // until the next item, so we never fight them over the track list.
    if (
      state.appliedIndex !== null &&
      currentSubtitleIndex !== state.appliedIndex
    ) {
      return {
        action: { kind: "none" },
        state: { appliedIndex: null, released: true },
      };
    }
    return { action: { kind: "none" }, state };
  }

  if (isMuted) {
    if (currentSubtitleIndex !== SUBTITLES_OFF) {
      return { action: { kind: "none" }, state };
    }
    const picked = pick();
    if (picked.index === null) {
      return { action: { kind: "notice", reason: picked.reason }, state };
    }
    return {
      action: { kind: "apply", index: picked.index },
      state: { appliedIndex: picked.index, released: false },
    };
  }

  // Unmuting: only undo what we did, and only while it is still the active track.
  const shouldRevert =
    state.appliedIndex !== null && currentSubtitleIndex === state.appliedIndex;
  return {
    action: shouldRevert ? { kind: "revert" } : { kind: "none" },
    state: INITIAL_AUTO_SUBTITLE_STATE,
  };
};
