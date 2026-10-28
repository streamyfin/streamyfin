import type { Api } from "@jellyfin/sdk";
import type {
  MediaSourceInfo,
  PlaybackInfoDto,
} from "@jellyfin/sdk/lib/generated-client/models";
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
 */
export const getAudioStreamUrl = async (
  api: Api,
  userId: string,
  itemId: string,
): Promise<AudioStreamResult | null> => {
  try {
    // Preserve the legacy flag omitted from both SDK request and DTO types.
    const playbackInfoDto: PlaybackInfoDto & { isPlayback: boolean } = {
      UserId: userId,
      DeviceProfile: trackPlayerProfile,
      StartTimeTicks: 0,
      isPlayback: true,
      AutoOpenLiveStream: true,
    };
    const res = await getMediaInfoApi(api).getPostedPlaybackInfo({
      itemId,
      playbackInfoDto,
    });

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
      // The SDK audio endpoints fetch files rather than return native-player URLs.
      url: api.getUri(`/Audio/${itemId}/stream`, streamParams),
      sessionId,
      mediaSource,
      isTranscoding: false,
    };
  } catch {
    return null;
  }
};
