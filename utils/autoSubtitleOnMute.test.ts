import { describe, expect, test } from "bun:test";
import type { AutoSubtitlePick } from "@/utils/jellyfin/subtitleUtils";
import {
  type AutoSubtitleState,
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
    expect(result.state).toEqual({ appliedIndex: 2, released: false });
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
      state: { appliedIndex: 2, released: false },
      isMuted: false,
      wasMuted: true,
      currentSubtitleIndex: 2,
    });
    expect(result.action).toEqual({ kind: "revert" });
    expect(result.state).toEqual(INITIAL_AUTO_SUBTITLE_STATE);
  });

  test("leaves the selection alone when the user changed it", () => {
    const result = run({
      state: { appliedIndex: 2, released: false },
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
      state: { appliedIndex: 2, released: false },
      isMuted: true,
      wasMuted: true,
      currentSubtitleIndex: 5,
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual({ appliedIndex: null, released: true });
  });

  test("treats turning subtitles off by hand as an override", () => {
    const result = run({
      state: { appliedIndex: 2, released: false },
      isMuted: true,
      wasMuted: true,
      currentSubtitleIndex: SUBTITLES_OFF,
    });
    expect(result.state).toEqual({ appliedIndex: null, released: true });
  });

  test("stays silent once released, even on a new mute transition", () => {
    const result = run({
      state: { appliedIndex: null, released: true },
      isMuted: true,
      wasMuted: false,
      currentSubtitleIndex: SUBTITLES_OFF,
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual({ appliedIndex: null, released: true });
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
      state: { appliedIndex: 2, released: false },
      isMuted: true,
      wasMuted: true,
      currentSubtitleIndex: 2,
    });
    expect(result.action).toEqual({ kind: "none" });
    expect(result.state).toEqual({ appliedIndex: 2, released: false });
  });
});
