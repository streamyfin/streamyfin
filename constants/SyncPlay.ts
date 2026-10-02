/** Preserve the existing sender-side limit when expanding media containers. */
export const SYNC_PLAY_QUEUE_LIMIT = 300;

/** Protocol timings match jellyfin-web's SyncPlay player adapter and scheduler. */
export const SYNC_PLAY_TUNING = {
  minDelaySkipToSync: 400,
  minBufferingThresholdMs: 3000,
  pendingPlaybackTimeoutMs: 1500,
  playerEventTimeoutMs: 500,
  seekReadyTimeoutMs: 30_000,
  /** Deterministic tolerance for native seek landing; never jitter the target. */
  commandPositionToleranceMs: 100,
} as const;

export const SYNC_PLAY_CLOCK = {
  measurements: 8,
  greedyIntervalMs: 1000,
  steadyIntervalMs: 60_000,
  greedyPingCount: 3,
} as const;
