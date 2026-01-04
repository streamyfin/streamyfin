import type { Api } from "@jellyfin/sdk";
import type { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { getMediaInfoApi } from "@jellyfin/sdk/lib/utils/api";
import native from "@/utils/profiles/native";

export interface AudioStreamResult {
  url: string;
  sessionId: string | null;
  mediaSource: MediaSourceInfo | null;
  isTranscoding: boolean;
}

/**
 * Get the audio stream URL for a Jellyfin item
 * Handles both direct streaming and transcoding scenarios
 */
export const getAudioStreamUrl = async (
  api: Api,
  userId: string,
  itemId: string,
): Promise<AudioStreamResult | null> => {
  try {
    const res = await getMediaInfoApi(api).getPlaybackInfo(
      { itemId },
      {
        method: "POST",
        data: {
          userId,
          deviceProfile: native,
          startTimeTicks: 0,
          isPlayback: true,
          autoOpenLiveStream: true,
        },
      },
    );

    const sessionId = res.data.PlaySessionId || null;
    const mediaSource = res.data.MediaSources?.[0] || null;

    if (mediaSource?.TranscodingUrl) {
      return {
        url: `${api.basePath}${mediaSource.TranscodingUrl}`,
        sessionId,
        mediaSource,
        isTranscoding: true,
      };
    }

    // Direct stream
    const streamParams = new URLSearchParams({
      static: "true",
      container: mediaSource?.Container || "mp3",
      mediaSourceId: mediaSource?.Id || "",
      deviceId: api.deviceInfo.id,
      api_key: api.accessToken,
      userId,
    });

    return {
      url: `${api.basePath}/Audio/${itemId}/stream?${streamParams.toString()}`,
      sessionId,
      mediaSource,
      isTranscoding: false,
    };
  } catch {
    return null;
  }
};
