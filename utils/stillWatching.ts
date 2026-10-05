import {
  DEFAULT_STILL_WATCHING_PRESET,
  STILL_WATCHING_PRESET_ORDER,
  type StillWatchingPreset,
  StillWatchingPresets,
  type StillWatchingThresholds,
} from "@/constants/StillWatching";
import { hasMeaningfulSettingValue } from "@/utils/atoms/settingsOverrides";

const MS_PER_MINUTE = 60_000;

export const isStillWatchingPreset = (
  value: unknown,
): value is StillWatchingPreset =>
  STILL_WATCHING_PRESET_ORDER.includes(value as StillWatchingPreset);

/**
 * The preset a stored or plugin value stands for: a known one as is, the old
 * episode count or a preset from a newer build as the nearest known one, and
 * nothing for an empty value.
 */
export const coerceStillWatchingPreset = (
  value: unknown,
): StillWatchingPreset | undefined => {
  if (isStillWatchingPreset(value)) return value;
  if (!hasMeaningfulSettingValue(value)) return undefined;
  if (typeof value === "boolean") return value ? "default" : "disabled";
  if (typeof value === "string") {
    // A server may spell them its own way ("VeryLong", "Disabled", "off").
    const spelled = value.trim().toLowerCase();
    if (["off", "none", "no", "never", "false"].includes(spelled)) {
      return "disabled";
    }
    const known = STILL_WATCHING_PRESET_ORDER.find(
      (preset) => preset.toLowerCase() === spelled,
    );
    if (known) return known;
  }
  return (
    stillWatchingPresetFromEpisodeCount(value) ?? DEFAULT_STILL_WATCHING_PRESET
  );
};

export const getStillWatchingThresholds = (
  preset: StillWatchingPreset | undefined,
): StillWatchingThresholds | null => {
  const known = coerceStillWatchingPreset(preset);
  return known && known !== "disabled" ? StillWatchingPresets[known] : null;
};

export type StillWatchingGateInput = {
  thresholds: StillWatchingThresholds | null;
  /** Episodes auto-played since the session was last reset. */
  playedCount: number;
  sessionDurationMs: number;
  /**
   * Time since the viewer last touched the player. Undefined when the player
   * cannot report input to JS (the native chrome); the idle branch is then
   * skipped and only the episode count can trip the prompt.
   */
  idleMs?: number;
};

/**
 * jellyfin-web 12's rule:
 * `sessionDuration >= duration && (idleTime >= duration || playedCount >= count)`.
 */
export const isStillWatchingDue = ({
  thresholds,
  playedCount,
  sessionDurationMs,
  idleMs,
}: StillWatchingGateInput): boolean => {
  if (!thresholds) return false;
  const durationMs = thresholds.minutes * MS_PER_MINUTE;
  // Written so a NaN duration (a missing position) fails the gate too.
  if (!(sessionDurationMs >= durationMs)) return false;
  if (idleMs !== undefined && idleMs >= durationMs) return true;
  return playedCount >= thresholds.episodes;
};

/**
 * Maps the old `maxAutoPlayEpisodeCount` cap (stored as `{ key, value }`, or a
 * bare number from the plugin) to the first preset whose episode count is at
 * least the cap; a cap past the longest preset gets the longest.
 */
export const stillWatchingPresetFromEpisodeCount = (
  legacy: unknown,
): StillWatchingPreset | undefined => {
  const raw =
    typeof legacy === "object" && legacy !== null && "value" in legacy
      ? (legacy as { value: unknown }).value
      : legacy;
  const count =
    typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (typeof count !== "number" || !Number.isFinite(count)) return undefined;
  if (count <= 0) return "disabled";
  const presets = STILL_WATCHING_PRESET_ORDER.filter(
    (preset): preset is Exclude<StillWatchingPreset, "disabled"> =>
      preset !== "disabled",
  );
  return (
    presets.find((preset) => StillWatchingPresets[preset].episodes >= count) ??
    presets[presets.length - 1]
  );
};

// The session lives in memory like jellyfin-web's: an app restart means the
// next play is one the viewer starts, which resets it anyway.
const session = {
  startMs: Date.now(),
  lastInputMs: Date.now(),
  playedCount: 0,
  // Bumped on every reset and autoplay, so a decision taken for an episode
  // can tell a later stream swap of it from a new play of it.
  epoch: 0,
};

/**
 * A play the viewer started themselves, "Continue watching" included. Every
 * such path calls this; autoplay never does.
 */
export const resetStillWatchingSession = (nowMs: number = Date.now()) => {
  session.startMs = nowMs;
  session.lastInputMs = nowMs;
  session.playedCount = 0;
  session.epoch += 1;
};

export const markStillWatchingInput = (nowMs: number = Date.now()) => {
  session.lastInputMs = nowMs;
};

export const recordStillWatchingAutoplay = () => {
  session.playedCount += 1;
  session.epoch += 1;
};

let decision: { key: string; due: boolean; inputMs: number } | null = null;

/**
 * The first decision taken for `itemId` since the last reset or autoplay,
 * reused for as long as that episode keeps playing, a stream swap included.
 * The native player only gets a snapshot, so changing it later could race a
 * countdown native is already running. An input since a "due" decision takes
 * it again, as the idle rule needs; it never turns "not due" into "due", so a
 * pause and resume inside a countdown can't swap it for the prompt.
 */
export const decideStillWatchingOnce = (
  itemId: string,
  decide: () => boolean,
): boolean => {
  const key = decisionKey(itemId);
  const stale =
    decision?.key !== key ||
    (decision.due && session.lastInputMs > decision.inputMs);
  if (stale) {
    decision = { key, due: decide(), inputMs: session.lastInputMs };
  }
  return decision?.due === true;
};

const decisionKey = (itemId: string) => `${session.epoch}:${itemId}`;

/** The decision already taken for `itemId`, if any, without taking one. */
export const peekStillWatchingDecision = (
  itemId: string,
): boolean | undefined =>
  decision?.key === decisionKey(itemId) ? decision.due : undefined;

/** Drops the decision for `itemId`, so the next one is taken afresh. */
export const releaseStillWatchingDecision = (itemId: string) => {
  if (decision?.key === decisionKey(itemId)) decision = null;
};

/**
 * Whether the prompt should replace autoplay at the end of the episode now
 * playing. Judged at the projected end, `remainingMs` from now, since that is
 * where the prompt takes autoplay's place.
 */
export const isStillWatchingDueAtEnd = ({
  preset,
  remainingMs,
  playbackRate = 1,
  tracksInput,
  nowMs = Date.now(),
}: {
  preset: StillWatchingPreset | undefined;
  /** Media time left; `playbackRate` turns it into wall-clock time. */
  remainingMs: number;
  playbackRate?: number;
  /** False where the player cannot report input to JS (the native chrome). */
  tracksInput: boolean;
  nowMs?: number;
}): boolean => {
  const rate = playbackRate > 0 ? playbackRate : 1;
  const atMs = nowMs + Math.max(0, remainingMs) / rate;
  return isStillWatchingDue({
    thresholds: getStillWatchingThresholds(preset),
    playedCount: session.playedCount,
    sessionDurationMs: atMs - session.startMs,
    idleMs: tracksInput ? atMs - session.lastInputMs : undefined,
  });
};
