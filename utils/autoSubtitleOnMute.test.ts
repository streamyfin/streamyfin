import { describe, expect, test } from "bun:test";
import type { AutoSubtitlePick } from "@/utils/jellyfin/subtitleUtils";
import {
  type AutoSubtitleState,
  carryAutoSubtitleState,
  INITIAL_AUTO_SUBTITLE_STATE,
  resolveAutoSubtitleAction,
} from "./autoSubtitleOnMute";

const SUBTITLES_OFF = -1;
/** Client-downloaded subtitles use indexes at or below this sentinel. */
const LOCAL_SUBTITLE = -100;

const pickTrack = (index: number) => (): AutoSubtitlePick => ({
  index,
  reason: null,
});

const pickNothing =
  (reason: "restart-required" | "none") => (): AutoSubtitlePick => ({
    index: null,
    reason,
  });

const run = (over: {
  state?: AutoSubtitleState;
  isMuted: boolean;
  wasMuted: boolean;
  currentSubtitleIndex: number;
  pick?: () => AutoSubtitlePick;
}) =>
  resolveAutoSubtitleAction({
    state: over.state ?? INITIAL_AUTO_SUBTITLE_STATE,
    isMuted: over.isMuted,
    wasMuted: over.wasMuted,
    currentSubtitleIndex: over.currentSubtitleIndex,
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
      released: false,
      ownsCarriedSubtitle: false,
    });
  });

  test("does nothing when muting while subtitles are already on", () => {
    const result = run({
      isMuted: true,
      wasMuted: false,
      currentSubtitleIndex: 3,
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
      },
      isMuted: false,
      wasMuted: true,
      currentSubtitleIndex: 2,
    });
    expect(result.action).toEqual({ kind: "revert" });
    expect(result.state).toEqual(INITIAL_AUTO_SUBTITLE_STATE);
  });

  test("leaves the selection alone when the user changed it", () => {
    const result = run({
      state: {
        ...INITIAL_AUTO_SUBTITLE_STATE,
        appliedIndex: 2,
      },
      isMuted: false,
      wasMuted: true,
      currentSubtitleIndex: 5,
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
      },
      isMuted: true,
      wasMuted: true,
      currentSubtitleIndex: 5,
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual({
      appliedIndex: null,
      released: true,
      ownsCarriedSubtitle: false,
    });
  });

  test("treats turning subtitles off by hand as an override", () => {
    const result = run({
      state: {
        ...INITIAL_AUTO_SUBTITLE_STATE,
        appliedIndex: 2,
      },
      isMuted: true,
      wasMuted: true,
      currentSubtitleIndex: SUBTITLES_OFF,
    });
    expect(result.state).toEqual({
      appliedIndex: null,
      released: true,
      ownsCarriedSubtitle: false,
    });
  });

  test("stays silent once released, even on a new mute transition", () => {
    const result = run({
      state: {
        ...INITIAL_AUTO_SUBTITLE_STATE,
        released: true,
      },
      isMuted: true,
      wasMuted: false,
      currentSubtitleIndex: SUBTITLES_OFF,
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual({
      appliedIndex: null,
      released: true,
      ownsCarriedSubtitle: false,
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
      },
      isMuted: true,
      wasMuted: true,
      currentSubtitleIndex: 2,
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual({
      appliedIndex: 2,
      released: false,
      ownsCarriedSubtitle: false,
    });
  });
});

describe("carryAutoSubtitleState — subtitle carried to the next item", () => {
  const muted = { isMuted: true };

  test("carries ownership when we applied the track and the sound is still off", () => {
    expect(
      carryAutoSubtitleState(
        { ...INITIAL_AUTO_SUBTITLE_STATE, appliedIndex: 5 },
        muted,
      ),
    ).toEqual({
      appliedIndex: null,
      released: false,
      ownsCarriedSubtitle: true,
    });
  });

  test("carries nothing when the sound is already back", () => {
    expect(
      carryAutoSubtitleState(
        { ...INITIAL_AUTO_SUBTITLE_STATE, appliedIndex: 5 },
        { isMuted: false },
      ),
    ).toEqual(INITIAL_AUTO_SUBTITLE_STATE);
  });

  test("carries nothing when the user had taken over", () => {
    expect(
      carryAutoSubtitleState(
        { appliedIndex: null, released: true, ownsCarriedSubtitle: false },
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
    const carried = carryAutoSubtitleState(
      { ...INITIAL_AUTO_SUBTITLE_STATE, appliedIndex: 5 },
      muted,
    );

    // New item starts muted with the carried subtitle already showing.
    const adopted = run({
      state: carried,
      isMuted: true,
      wasMuted: false,
      currentSubtitleIndex: 5,
    });
    expect(adopted.action).toEqual({ kind: "none" });
    expect(adopted.state).toEqual({
      appliedIndex: 5,
      released: false,
      ownsCarriedSubtitle: false,
    });

    // Sound comes back: the adopted track is ours to undo.
    const reverted = run({
      state: adopted.state,
      isMuted: false,
      wasMuted: true,
      currentSubtitleIndex: 5,
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
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual(INITIAL_AUTO_SUBTITLE_STATE);
  });

  test("undoes the carried-over track when the sound returns before adoption", () => {
    const carried = carryAutoSubtitleState(
      { ...INITIAL_AUTO_SUBTITLE_STATE, appliedIndex: 5 },
      muted,
    );
    const result = run({
      state: carried,
      isMuted: false,
      wasMuted: false,
      currentSubtitleIndex: 5,
    });
    expect(result.action).toEqual({ kind: "revert" });
    expect(result.state).toEqual(INITIAL_AUTO_SUBTITLE_STATE);
  });

  test("has nothing to undo when the new item started with no subtitle", () => {
    const carried = carryAutoSubtitleState(
      { ...INITIAL_AUTO_SUBTITLE_STATE, appliedIndex: 5 },
      muted,
    );
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
