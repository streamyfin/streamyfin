import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  JELLYFIN_MAX_AUDIOBOOK_RESUME_MINUTES,
  JELLYFIN_MAX_RESUME_PCT,
  JELLYFIN_MIN_AUDIOBOOK_RESUME_MINUTES,
  JELLYFIN_MIN_RESUME_DURATION_SECONDS,
  JELLYFIN_MIN_RESUME_PCT,
} from "@/constants/Jellyfin";

const TICKS_PER_SECOND = 10_000_000;
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND;

export type PlayState = {
  /** The resume position to keep, 0 for none. */
  positionTicks: number;
  /** Counts as played. Jellyfin never un-marks a played item here. */
  playedToCompletion: boolean;
};

/**
 * Where a stopped position lands, as Jellyfin's UserDataManager.UpdatePlayState
 * decides it with the server's default thresholds. For progress the server
 * never sees through a playback report: a download played offline, or a
 * position another app hands back.
 */
export const resolvePlayState = (
  item: Pick<BaseItemDto, "Type" | "RunTimeTicks">,
  positionTicks: number,
): PlayState => {
  const runtimeTicks = item.RunTimeTicks ?? 0;
  const resume = { positionTicks, playedToCompletion: false };
  const played = { positionTicks: 0, playedToCompletion: true };
  const ignored = { positionTicks: 0, playedToCompletion: false };

  // The server cannot tell how far in a position is without a runtime.
  if (runtimeTicks <= 0) return played;
  if (positionTicks <= 0) return ignored;

  if (item.Type === "AudioBook") {
    const remainingTicks = runtimeTicks - positionTicks;
    if (
      positionTicks <
      JELLYFIN_MIN_AUDIOBOOK_RESUME_MINUTES * TICKS_PER_MINUTE
    )
      return ignored;
    if (
      remainingTicks <
        JELLYFIN_MAX_AUDIOBOOK_RESUME_MINUTES * TICKS_PER_MINUTE ||
      positionTicks >= runtimeTicks
    )
      return played;
    return resume;
  }
  if (item.Type === "Book") return resume;

  const percent = (positionTicks / runtimeTicks) * 100;
  if (percent < JELLYFIN_MIN_RESUME_PCT) return ignored;
  if (
    percent > JELLYFIN_MAX_RESUME_PCT ||
    positionTicks >= runtimeTicks - TICKS_PER_SECOND
  )
    return played;
  if (runtimeTicks < JELLYFIN_MIN_RESUME_DURATION_SECONDS * TICKS_PER_SECOND)
    return played;
  return resume;
};
