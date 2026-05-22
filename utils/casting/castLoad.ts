/**
 * Unified Chromecast media loading.
 *
 * Owns the getStreamUrl → buildCastMediaInfo → loadMedia sequence that was
 * previously duplicated across PlayButton and the casting player. Builds the
 * device profile from detected capabilities and retries once with a forced
 * conservative profile when the receiver rejects the initial load (status 2100).
 */

import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { RemoteMediaClient } from "react-native-google-cast";
import { buildChromecastProfile } from "@/utils/casting/buildProfile";
import {
  type ChromecastProfileMode,
  detectCapabilities,
} from "@/utils/casting/capabilities";
import { isLoadFailedError } from "@/utils/casting/castErrors";
import { buildCastMediaInfo } from "@/utils/casting/mediaInfo";
import { resolveSelection } from "@/utils/casting/selection";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";

export interface CastLoadOptions {
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  maxBitrate?: number;
  mediaSourceId?: string;
  startPositionMs?: number;
}

export interface CastLoadParams {
  client: RemoteMediaClient;
  /** Cast device — only `modelName` is read, for capability detection. */
  device: { modelName?: string } | null;
  api: Api;
  item: BaseItemDto;
  userId: string;
  profileMode: ChromecastProfileMode;
  /** Manual bitrate cap from settings, in bits per second. */
  maxBitrateSetting?: number;
  options?: CastLoadOptions;
}

export type CastLoadResult = { ok: true } | { ok: false; error: unknown };

const attemptLoad = async (
  params: CastLoadParams,
  caps: Parameters<typeof buildChromecastProfile>[0],
): Promise<void> => {
  const { api, item, userId, client, options } = params;
  const profile = buildChromecastProfile(caps);

  const selection = resolveSelection(item, {
    mediaSourceId: options?.mediaSourceId,
    audioStreamIndex: options?.audioStreamIndex,
    subtitleStreamIndex: options?.subtitleStreamIndex,
    maxBitrate: options?.maxBitrate,
  });

  const startPositionMs = options?.startPositionMs ?? 0;

  const data = await getStreamUrl({
    api,
    item,
    userId,
    startTimeTicks: Math.floor(startPositionMs * 10000),
    deviceProfile: profile,
    audioStreamIndex: selection.audioStreamIndex,
    subtitleStreamIndex: selection.subtitleStreamIndex,
    maxStreamingBitrate: selection.maxBitrate,
    mediaSourceId: selection.mediaSourceId,
  });

  if (!data?.url) {
    throw new Error("getStreamUrl returned no URL");
  }

  const playMethod: "Transcode" | "DirectPlay" = data.mediaSource
    ?.TranscodingUrl
    ? "Transcode"
    : "DirectPlay";

  await client.loadMedia({
    mediaInfo: buildCastMediaInfo({
      item,
      streamUrl: data.url,
      api,
      playSessionId: data.sessionId ?? undefined,
      selection,
      playMethod,
    }),
    startTime: startPositionMs / 1000,
  });
};

/**
 * Load media onto the connected Chromecast.
 * On a status-2100 rejection, retries once with a forced conservative profile.
 */
export const loadCastMedia = async (
  params: CastLoadParams,
): Promise<CastLoadResult> => {
  const caps = detectCapabilities(params.device, {
    profileMode: params.profileMode,
    maxBitrate: params.maxBitrateSetting,
  });

  try {
    await attemptLoad(params, caps);
    return { ok: true };
  } catch (error) {
    if (!isLoadFailedError(error)) {
      return { ok: false, error };
    }
    // Downgrade-on-failure: one retry with the safest possible profile.
    // The bitrate cap must also be applied to the explicit getStreamUrl
    // `maxBitrate` request param — Jellyfin uses that as the effective
    // ceiling, so the conservative profile alone would not lower it.
    try {
      const fallback = detectCapabilities(params.device, {
        profileMode: "force-h264",
      });
      const FALLBACK_MAX_BITRATE = 4_000_000;
      const fallbackParams: CastLoadParams = {
        ...params,
        options: {
          ...params.options,
          maxBitrate: Math.min(
            params.options?.maxBitrate ?? Number.POSITIVE_INFINITY,
            FALLBACK_MAX_BITRATE,
          ),
        },
      };
      await attemptLoad(fallbackParams, {
        ...fallback,
        maxVideoBitrate: FALLBACK_MAX_BITRATE,
        maxAudioChannels: 2,
      });
      return { ok: true };
    } catch (retryError) {
      return { ok: false, error: retryError };
    }
  }
};
