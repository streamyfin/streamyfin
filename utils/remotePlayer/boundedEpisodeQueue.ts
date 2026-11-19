import type { StillWatchingPreset } from "@/constants/StillWatching";
import type { ReceiverPlayItem } from "@/modules/mpv-player/src/cast/Cast.types";
import {
  getStillWatchingThresholds,
  isStillWatchingDue,
} from "@/utils/stillWatching";

/** An episode of the series, as much of it as the bound needs. */
export interface QueueEpisode {
  id: string;
  name: string | null;
  runTimeTicks: number | null;
}

/** The items a PlayNow carries, and the episode that comes after them, for the next up card. */
export interface BoundedQueue {
  items: ReceiverPlayItem[];
  nextUpId: string | null;
}

const TICKS_PER_MS = 10_000;

/**
 * The rank, counted from the episode asked, whose end the local player would meet with "Are you still watching?":
 * the first `k` the still watching rule calls due once `k` episodes have auto-played and ranks 0 to `k` have run.
 * A length unknown on the way counts the minutes as reached. Null when no rank is.
 */
const promptRank = (
  episodes: QueueEpisode[],
  index: number,
  startPositionTicks: number,
  preset: StillWatchingPreset | undefined,
): number | null => {
  const thresholds = getStillWatchingThresholds(preset);
  if (!thresholds) return null;
  let sessionDurationMs = 0;
  for (let k = 0; index + k < episodes.length; k++) {
    const runTimeTicks = episodes[index + k].runTimeTicks;
    const playedTicks =
      runTimeTicks === null
        ? Number.POSITIVE_INFINITY
        : runTimeTicks - (k === 0 ? startPositionTicks : 0);
    sessionDurationMs += Math.max(0, playedTicks) / TICKS_PER_MS;
    if (isStillWatchingDue({ thresholds, playedCount: k, sessionDurationMs })) {
      return k;
    }
  }
  return null;
};

/**
 * What the TV gets for an episode: the episodes the local player would auto-play from it before its "Are you still
 * watching?" prompt, which the receiver cannot show. Autoplay off sends the episode alone, a disabled preset the rest
 * of the series. A lone episode goes without its type: the receiver unfolds a typed one into the series.
 */
export const boundedEpisodeQueue = ({
  episodes,
  index,
  startPositionTicks,
  autoPlayNextEpisode,
  preset,
}: {
  episodes: QueueEpisode[];
  index: number;
  startPositionTicks: number;
  autoPlayNextEpisode: boolean;
  preset: StillWatchingPreset | undefined;
}): BoundedQueue => {
  const rank = autoPlayNextEpisode
    ? promptRank(episodes, index, startPositionTicks, preset)
    : 0;
  const end =
    rank === null
      ? episodes.length
      : Math.min(index + rank + 1, episodes.length);
  const sent = episodes.slice(index, end);
  const typed = sent.length > 1;
  return {
    items: sent.map((episode) => ({
      id: episode.id,
      name: episode.name ?? undefined,
      ...(typed ? { type: "Episode" } : {}),
      mediaType: "Video",
      isFolder: false,
    })),
    nextUpId: episodes[end]?.id ?? null,
  };
};
