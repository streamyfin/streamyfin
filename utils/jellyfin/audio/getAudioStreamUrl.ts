import type { Api } from "@jellyfin/sdk";
import type { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { getMediaInfoApi } from "@jellyfin/sdk/lib/utils/api";
import trackPlayerProfile from "../../profiles/trackplayer";

export interface AudioStreamResult {
  url: string;
  sessionId: string | null;
  mediaSource: MediaSourceInfo | null;
  isTranscoding: boolean;
}

/**
 * Get the audio stream URL for a Jellyfin item
 * Handles both direct streaming and transcoding scenarios
 *
 * Rejects with the request's own error, for a caller that reports it: that
 * error is what tells a server out of reach from one refusing the track.
 */
export const requestAudioStream = async (
  api: Api,
  userId: string,
  itemId: string,
): Promise<AudioStreamResult> => {
  const res = await getMediaInfoApi(api).getPlaybackInfo(
    { itemId },
    {
      method: "POST",
      data: {
        userId,
        deviceProfile: trackPlayerProfile,
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
    ApiKey: api.accessToken,
    userId,
  });

  return {
    url: `${api.basePath}/Audio/${itemId}/stream?${streamParams.toString()}`,
    sessionId,
    mediaSource,
    isTranscoding: false,
  };
};

/** As requestAudioStream, with null for any failure. */
export const getAudioStreamUrl = async (
  api: Api,
  userId: string,
  itemId: string,
): Promise<AudioStreamResult | null> => {
  try {
    return await requestAudioStream(api, userId, itemId);
  } catch {
    return null;
  }
};
