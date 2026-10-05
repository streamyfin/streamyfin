import {
  type StillWatchingPreset,
  StillWatchingPresets,
  type StillWatchingThresholds,
} from "@/constants/StillWatching";

const MS_PER_MINUTE = 60_000;

export const getStillWatchingThresholds = (
  preset: StillWatchingPreset | undefined,
): StillWatchingThresholds | null =>
  preset && preset !== "disabled"
    ? (StillWatchingPresets[preset] ?? null)
    : null;

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
  if (sessionDurationMs < durationMs) return false;
  if (idleMs !== undefined && idleMs >= durationMs) return true;
  return playedCount >= thresholds.episodes;
};

/**
 * Maps the old `maxAutoPlayEpisodeCount` cap (stored as `{ key, value }`, or a
 * bare number from the plugin) to the preset that stops no earlier than it
 * did, so nobody is prompted sooner than before.
 */
export const stillWatchingPresetFromEpisodeCount = (
  legacy: unknown,
): StillWatchingPreset | undefined => {
  const count =
    typeof legacy === "object" && legacy !== null && "value" in legacy
      ? (legacy as { value: unknown }).value
      : legacy;
  if (typeof count !== "number" || !Number.isFinite(count)) return undefined;
  if (count <= 0) return "disabled";
  const presets = Object.entries(StillWatchingPresets) as Array<
    [Exclude<StillWatchingPreset, "disabled">, StillWatchingThresholds]
  >;
  return (
    presets.find(([, { episodes }]) => episodes >= count)?.[0] ?? "veryLong"
  );
};

// The session lives in memory like jellyfin-web's: an app restart means the
// next play is a deliberate one, which resets it anyway.
let sessionStartMs = Date.now();
let lastInputMs = sessionStartMs;

/** A play the viewer started themselves, or a "Continue watching" answer. */
export const resetStillWatchingSession = (nowMs: number = Date.now()) => {
  sessionStartMs = nowMs;
  lastInputMs = nowMs;
};

export const markStillWatchingInput = (nowMs: number = Date.now()) => {
  lastInputMs = nowMs;
};

/**
 * Whether the prompt is due at `atMs`. Callers pass the projected end of the
 * current episode, since that is where the prompt replaces autoplay.
 */
export const isStillWatchingDueAt = ({
  preset,
  playedCount,
  atMs,
  tracksInput,
}: {
  preset: StillWatchingPreset | undefined;
  playedCount: number;
  atMs: number;
  tracksInput: boolean;
}): boolean =>
  isStillWatchingDue({
    thresholds: getStillWatchingThresholds(preset),
    playedCount,
    sessionDurationMs: atMs - sessionStartMs,
    idleMs: tracksInput ? atMs - lastInputMs : undefined,
  });
