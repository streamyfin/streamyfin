import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { ticksToMs } from "@/utils/time";

export const initializeProgress = (item: BaseItemDto, isVlc: boolean) => {
  const initialProgress = isVlc
    ? ticksToMs(item?.UserData?.PlaybackPositionTicks)
    : item?.UserData?.PlaybackPositionTicks || 0;

  const maxProgress = isVlc
    ? ticksToMs(item.RunTimeTicks || 0)
    : item.RunTimeTicks || 0;

  return { initialProgress, maxProgress };
};
