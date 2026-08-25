import { describe, expect, test } from "bun:test";
import type {
  AutoSubtitlePick,
  AutoSubtitleTrackIdentity,
} from "@/utils/jellyfin/subtitleUtils";
import {
  type AutoSubtitleState,
  carryAutoSubtitleState,
  INITIAL_AUTO_SUBTITLE_STATE,
  resolveAutoSubtitleAction,
} from "./autoSubtitleOnMute";

const SUBTITLES_OFF = -1;
/** Client-downloaded subtitles use indexes at or below this sentinel. */
const LOCAL_SUBTITLE = -100;

const FRA: AutoSubtitleTrackIdentity = { language: "fra", isForced: false };
const FRA_FORCED: AutoSubtitleTrackIdentity = {
  language: "fra",
  isForced: true,
};
const ENG: AutoSubtitleTrackIdentity = { language: "eng", isForced: false };

const pickTrack =
  (index: number, track: AutoSubtitleTrackIdentity = FRA) =>
  (): AutoSubtitlePick => ({ index, track, reason: null });

const pickNothing =
  (reason: "restart-required" | "none") => (): AutoSubtitlePick => ({
    index: null,
    track: null,
    reason,
  });

const run = (over: {
  state?: AutoSubtitleState;
  isMuted: boolean;
  wasMuted: boolean;
  currentSubtitleIndex: number;
  currentTrack?: AutoSubtitleTrackIdentity | null;
  pick?: () => AutoSubtitlePick;
}) =>
  resolveAutoSubtitleAction({
    state: over.state ?? INITIAL_AUTO_SUBTITLE_STATE,
    isMuted: over.isMuted,
    wasMuted: over.wasMuted,
    currentSubtitleIndex: over.currentSubtitleIndex,
    currentTrack: over.currentTrack ?? null,
    pick: over.pick ?? pickTrack(2),
  });

describe("resolveAutoSubtitleAction — muting", () => {
  test("applies a track when muting with subtitles off", () => {
    const result = run({
      isMuted: true,
      wasMuted: false,
      currentSubtitleIndex: SUBTITLES_OFF,
    });
    expect(result.action).toEqual({ kind: "apply", index: 2 });
    expect(result.state).toEqual({
      appliedIndex: 2,
      appliedTrack: FRA,
      released: false,
      carriedTrack: null,
    });
  });

  test("does nothing when muting while subtitles are already on", () => {
    const result = run({
      isMuted: true,
      wasMuted: false,
      currentSubtitleIndex: 3,
      currentTrack: ENG,
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual(INITIAL_AUTO_SUBTITLE_STATE);
  });

  test("treats a client-downloaded subtitle as already on", () => {
    const result = run({
      isMuted: true,
      wasMuted: false,
      currentSubtitleIndex: LOCAL_SUBTITLE,
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual(INITIAL_AUTO_SUBTITLE_STATE);
  });

  test("emits a notice when no track can be applied without a restart", () => {
    const result = run({
      isMuted: true,
      wasMuted: false,
      currentSubtitleIndex: SUBTITLES_OFF,
      pick: pickNothing("restart-required"),
    });
    expect(result.action).toEqual({
      kind: "notice",
      reason: "restart-required",
    });
    expect(result.state).toEqual(INITIAL_AUTO_SUBTITLE_STATE);
  });

  test("emits a notice when the item carries no subtitle at all", () => {
    const result = run({
      isMuted: true,
      wasMuted: false,
      currentSubtitleIndex: SUBTITLES_OFF,
      pick: pickNothing("none"),
    });
    expect(result.action).toEqual({ kind: "notice", reason: "none" });
  });
});

describe("resolveAutoSubtitleAction — unmuting", () => {
  test("reverts when the applied track is still selected", () => {
    const result = run({
      state: {
        ...INITIAL_AUTO_SUBTITLE_STATE,
        appliedIndex: 2,
        appliedTrack: FRA,
      },
      isMuted: false,
      wasMuted: true,
      currentSubtitleIndex: 2,
      currentTrack: FRA,
    });
    expect(result.action).toEqual({ kind: "revert" });
    expect(result.state).toEqual(INITIAL_AUTO_SUBTITLE_STATE);
  });

  test("leaves the selection alone when the user changed it", () => {
    const result = run({
      state: {
        ...INITIAL_AUTO_SUBTITLE_STATE,
        appliedIndex: 2,
        appliedTrack: FRA,
      },
      isMuted: false,
      wasMuted: true,
      currentSubtitleIndex: 5,
      currentTrack: ENG,
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual(INITIAL_AUTO_SUBTITLE_STATE);
  });

  test("does nothing when it never applied anything", () => {
    const result = run({
      isMuted: false,
      wasMuted: true,
      currentSubtitleIndex: SUBTITLES_OFF,
    });
    expect(result.action).toEqual({ kind: "none" });
  });
});

describe("resolveAutoSubtitleAction — user override", () => {
  test("releases control for the session when the user overrides while muted", () => {
    const result = run({
      state: {
        ...INITIAL_AUTO_SUBTITLE_STATE,
        appliedIndex: 2,
        appliedTrack: FRA,
      },
      isMuted: true,
      wasMuted: true,
      currentSubtitleIndex: 5,
      currentTrack: ENG,
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual({
      appliedIndex: null,
      appliedTrack: null,
      released: true,
      carriedTrack: null,
    });
  });

  test("treats turning subtitles off by hand as an override", () => {
    const result = run({
      state: {
        ...INITIAL_AUTO_SUBTITLE_STATE,
        appliedIndex: 2,
        appliedTrack: FRA,
      },
      isMuted: true,
      wasMuted: true,
      currentSubtitleIndex: SUBTITLES_OFF,
    });
    expect(result.state).toEqual({
      appliedIndex: null,
      appliedTrack: null,
      released: true,
      carriedTrack: null,
    });
  });

  test("stays silent once released, even on a new mute transition", () => {
    const result = run({
      state: { ...INITIAL_AUTO_SUBTITLE_STATE, released: true },
      isMuted: true,
      wasMuted: false,
      currentSubtitleIndex: SUBTITLES_OFF,
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual({
      appliedIndex: null,
      appliedTrack: null,
      released: true,
      carriedTrack: null,
    });
  });
});

describe("resolveAutoSubtitleAction — no transition", () => {
  test("does nothing when the mute state did not change", () => {
    const result = run({
      isMuted: false,
      wasMuted: false,
      currentSubtitleIndex: SUBTITLES_OFF,
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual(INITIAL_AUTO_SUBTITLE_STATE);
  });

  test("does not re-apply while muting persists", () => {
    const result = run({
      state: {
        ...INITIAL_AUTO_SUBTITLE_STATE,
        appliedIndex: 2,
        appliedTrack: FRA,
      },
      isMuted: true,
      wasMuted: true,
      currentSubtitleIndex: 2,
      currentTrack: FRA,
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual({
      appliedIndex: 2,
      appliedTrack: FRA,
      released: false,
      carriedTrack: null,
    });
  });
});

describe("carryAutoSubtitleState — subtitle carried to the next item", () => {
  const muted = { isMuted: true };
  const applied = {
    ...INITIAL_AUTO_SUBTITLE_STATE,
    appliedIndex: 5,
    appliedTrack: FRA,
  };

  test("carries the track when we applied it and the sound is still off", () => {
    expect(carryAutoSubtitleState(applied, muted)).toEqual({
      appliedIndex: null,
      appliedTrack: null,
      released: false,
      carriedTrack: FRA,
    });
  });

  test("carries nothing when the sound is already back", () => {
    expect(carryAutoSubtitleState(applied, { isMuted: false })).toEqual(
      INITIAL_AUTO_SUBTITLE_STATE,
    );
  });

  test("carries nothing when the user had taken over", () => {
    expect(
      carryAutoSubtitleState(
        {
          appliedIndex: null,
          appliedTrack: null,
          released: true,
          carriedTrack: null,
        },
        muted,
      ),
    ).toEqual(INITIAL_AUTO_SUBTITLE_STATE);
  });

  test("carries nothing when we never applied anything", () => {
    expect(carryAutoSubtitleState(INITIAL_AUTO_SUBTITLE_STATE, muted)).toEqual(
      INITIAL_AUTO_SUBTITLE_STATE,
    );
  });

  test("adopts the carried track so unmuting still turns it off", () => {
    const carried = carryAutoSubtitleState(applied, muted);

    // New item starts muted with the carried subtitle already showing, under a
    // different index: the carry-over matches by language, not by number.
    const adopted = run({
      state: carried,
      isMuted: true,
      wasMuted: false,
      currentSubtitleIndex: 8,
      currentTrack: FRA,
    });
    expect(adopted.action).toEqual({ kind: "none" });
    expect(adopted.state).toEqual({
      appliedIndex: 8,
      appliedTrack: FRA,
      released: false,
      carriedTrack: null,
    });

    // Sound comes back: the adopted track is ours to undo.
    const reverted = run({
      state: adopted.state,
      isMuted: false,
      wasMuted: true,
      currentSubtitleIndex: 8,
      currentTrack: FRA,
    });
    expect(reverted.action).toEqual({ kind: "revert" });
    expect(reverted.state).toEqual(INITIAL_AUTO_SUBTITLE_STATE);
  });

  test("does not adopt a subtitle the user had chosen before the item changed", () => {
    const carried = carryAutoSubtitleState(INITIAL_AUTO_SUBTITLE_STATE, muted);
    const result = run({
      state: carried,
      isMuted: true,
      wasMuted: false,
      currentSubtitleIndex: 3,
      currentTrack: ENG,
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual(INITIAL_AUTO_SUBTITLE_STATE);
  });

  test("does not adopt a track the user picked while the new item was loading", () => {
    const carried = carryAutoSubtitleState(applied, muted);
    const result = run({
      state: carried,
      isMuted: true,
      wasMuted: false,
      currentSubtitleIndex: 4,
      currentTrack: ENG,
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual(carried);
  });

  test("does not mistake the forced variant of the carried language for ours", () => {
    const carried = carryAutoSubtitleState(applied, muted);
    const result = run({
      state: carried,
      isMuted: true,
      wasMuted: false,
      currentSubtitleIndex: 4,
      currentTrack: FRA_FORCED,
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual(carried);
  });

  test("undoes the carried-over track when the sound returns before adoption", () => {
    const carried = carryAutoSubtitleState(applied, muted);
    const result = run({
      state: carried,
      isMuted: false,
      wasMuted: false,
      currentSubtitleIndex: 5,
      currentTrack: FRA,
    });
    expect(result.action).toEqual({ kind: "revert" });
    expect(result.state).toEqual(INITIAL_AUTO_SUBTITLE_STATE);
  });

  test("leaves a track the user picked instead of the carried one alone", () => {
    const carried = carryAutoSubtitleState(applied, muted);
    const result = run({
      state: carried,
      isMuted: false,
      wasMuted: false,
      currentSubtitleIndex: 5,
      currentTrack: ENG,
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual(INITIAL_AUTO_SUBTITLE_STATE);
  });

  test("has nothing to undo when the new item started with no subtitle", () => {
    const carried = carryAutoSubtitleState(applied, muted);
    const result = run({
      state: carried,
      isMuted: false,
      wasMuted: false,
      currentSubtitleIndex: SUBTITLES_OFF,
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual(INITIAL_AUTO_SUBTITLE_STATE);
  });
});
