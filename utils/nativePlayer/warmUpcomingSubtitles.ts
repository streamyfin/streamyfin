import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  SUBTITLE_BACKGROUND_BUDGET_MS,
  SUBTITLE_BACKGROUND_PER_SUBTITLE_MS,
} from "@/constants/Playback";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import type { generateDeviceProfile } from "@/utils/profiles/native";
import { prefetchExternalSubtitles } from "./externalSubtitles";

/**
 * Fetch the sidecar subtitles of an item that is about to play — the next
 * episode of the queue — into the cache while something else is still on
 * screen. Resolves true when every sidecar landed on disk, false when the
 * swap's background delivery would still have to fetch one (a failed
 * negotiation, a budget miss), so the caller can try again. The swap links
 * cached sidecars synchronously and fetches the rest after the player is up,
 * so a warm hit makes the subtitles available the moment the next episode
 * starts instead of a few seconds into it.
 *
 * Best effort by design: a warm that fails or misses its budget costs
 * nothing — the swap's background delivery fetches the subtitle itself,
 * exactly as it would have without the warm.
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
  /** The tracks and bitrate cap the swap will carry, so both negotiate alike. */
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  maxStreamingBitrate?: number;
}): Promise<boolean> => {
  if (!params.item.Id) return true;
  try {
    // A negotiation, not a playback start: PlaybackInfo hands back the
    // MediaSources with their DeliveryUrls without opening a session.
    const res = await getStreamUrl({
      api: params.api,
      item: params.item,
      startTimeTicks: 0,
      userId: params.userId,
      audioStreamIndex: params.audioStreamIndex ?? 0,
      subtitleStreamIndex: params.subtitleStreamIndex,
      maxStreamingBitrate: params.maxStreamingBitrate,
      deviceProfile: params.deviceProfile,
      mediaSourceId: params.mediaSourceId ?? undefined,
      // Nothing plays this negotiation: a source that needs opening must not
      // be opened for it, it would never be closed.
      autoOpenLiveStream: false,
    });
    if (!res?.mediaSource) return false;
    // Background of the playing episode, so the generous budget applies: a
    // first-time extraction can take seconds, and the warm is the best chance
    // to spend them before the swap needs the file.
    const outcome = await prefetchExternalSubtitles({
      mediaSource: res.mediaSource,
      item: params.item,
      api: params.api,
      preferredIndex: params.subtitleStreamIndex,
      budgetMs: SUBTITLE_BACKGROUND_BUDGET_MS,
      perSubtitleMs: SUBTITLE_BACKGROUND_PER_SUBTITLE_MS,
    });
    return outcome.keptRemote.length === 0 && outcome.leftOut.length === 0;
  } catch {
    // The swap prefetches on its own; a failed warm costs nothing.
    return false;
  }
};
