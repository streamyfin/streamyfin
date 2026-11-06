import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import type { generateDeviceProfile } from "@/utils/profiles/native";
import { prefetchExternalSubtitles } from "./externalSubtitles";

/**
 * Fetch the sidecar subtitles of an item that is about to play — the next
 * episode of the queue — into the cache while something else is still on
 * screen. The next-episode swap runs this same prefetch inline
 * (`buildNativePlayerConfig`), and on a slow path that wait is the delay
 * between one episode ending and the next one starting to load; warming
 * turns it into a cache hit.
 *
 * Best effort by design: a warm that fails or misses its budget costs
 * nothing — the swap fetches the subtitle itself, exactly as it would have
 * without the warm.
 */
export const warmUpcomingSubtitles = async (params: {
  api: Api;
  item: BaseItemDto;
  userId?: string;
  /** Same profile inputs the swap's negotiation uses, so DeliveryUrls agree. */
  deviceProfile: ReturnType<typeof generateDeviceProfile>;
  /**
   * The version the swap would pick (jellyfin-androidtv-style name match).
   * Without it the negotiation answers with the server's default version and
   * a multi-version item warms subtitles for the wrong one — harmless (the
   * swap's cache key carries the source id), just wasted.
   */
  mediaSourceId?: string | null;
}): Promise<void> => {
  if (!params.item.Id) return;
  try {
    // A negotiation, not a playback start: PlaybackInfo hands back the
    // MediaSources with their DeliveryUrls without opening a session.
    const res = await getStreamUrl({
      api: params.api,
      item: params.item,
      startTimeTicks: 0,
      userId: params.userId,
      audioStreamIndex: 0,
      deviceProfile: params.deviceProfile,
      mediaSourceId: params.mediaSourceId ?? undefined,
    });
    if (!res?.mediaSource) return;
    await prefetchExternalSubtitles({
      mediaSource: res.mediaSource,
      item: params.item,
      api: params.api,
    });
  } catch {
    // The swap prefetches on its own; a failed warm is invisible.
  }
};
