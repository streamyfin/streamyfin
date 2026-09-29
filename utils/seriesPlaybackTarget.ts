import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";

/**
 * Picks the episode a series-level Play action should target.
 *
 * Episodes must be supplied in playback order. A resumable episode wins,
 * followed by the first unplayed episode, then the first episode when the
 * series is complete.
 */
export const getSeriesPlaybackTarget = (
  episodes: readonly BaseItemDto[],
): BaseItemDto | undefined =>
  episodes.find(
    (episode) =>
      !episode.UserData?.Played &&
      (episode.UserData?.PlaybackPositionTicks ?? 0) > 0,
  ) ??
  episodes.find((episode) => !episode.UserData?.Played) ??
  episodes[0];
