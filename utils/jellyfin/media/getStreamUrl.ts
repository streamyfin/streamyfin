import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { BaseItemKind } from "@jellyfin/sdk/lib/generated-client/models/base-item-kind";
import { getMediaInfoApi } from "@jellyfin/sdk/lib/utils/api";
import { generateDownloadProfile } from "../../profiles/download";
import type { AudioTranscodeModeType } from "../../profiles/native";

interface StreamResult {
  url: string;
  sessionId: string | null;
  mediaSource: MediaSourceInfo | undefined;
  requiredHttpHeaders?: Record<string, string>;
}

/**
 * Gets the actual streaming URL - handles both transcoded and direct play logic
 * Returns only the URL string
 */
const getPlaybackUrl = (
  api: Api,
  itemId: string,
  mediaSource: MediaSourceInfo | undefined,
  params: {
    subtitleStreamIndex?: number;
    audioStreamIndex?: number;
    deviceId?: string | null;
    startTimeTicks?: number;
    maxStreamingBitrate?: number;
    userId: string;
    playSessionId?: string | null;
  },
): string => {
  let transcodeUrl = mediaSource?.TranscodingUrl;

  // Handle transcoded URL if available
  if (transcodeUrl) {
    // For regular streaming, change subtitle method to HLS for transcoded URL
    if (params.subtitleStreamIndex === -1) {
      transcodeUrl = transcodeUrl.replace(
        "SubtitleMethod=Encode",
        "SubtitleMethod=Hls",
      );
    }

    console.log("Video is being transcoded:", transcodeUrl);
    return `${api.basePath}${transcodeUrl}`;
  }

  // Handle remote/external streams (like live TV with external URLs)
  // These have Protocol "Http" and IsRemote true, with the actual URL in Path
  if (
    mediaSource?.IsRemote &&
    mediaSource?.Protocol === "Http" &&
    mediaSource?.Path
  ) {
    console.log("Video is remote stream, using direct Path:", mediaSource.Path);
    return mediaSource.Path;
  }

  // Fall back to direct play
  // Use the mediaSource's actual container when available (important for live TV
  // where the container may be ts/hls, not mp4)
  const container = mediaSource?.Container || "mp4";
  const streamParams = new URLSearchParams({
    static: "true",
    container,
    mediaSourceId: mediaSource?.Id || "",
    subtitleStreamIndex: params.subtitleStreamIndex?.toString() || "",
    audioStreamIndex: params.audioStreamIndex?.toString() || "",
    deviceId: params.deviceId || api.deviceInfo.id,
    ApiKey: api.accessToken,
    startTimeTicks: params.startTimeTicks?.toString() || "0",
    maxStreamingBitrate: params.maxStreamingBitrate?.toString() || "",
    userId: params.userId,
  });

  // Add additional parameters if provided
  if (params.playSessionId) {
    streamParams.append("playSessionId", params.playSessionId);
  }

  const directPlayUrl = `${api.basePath}/Videos/${itemId}/stream?${streamParams.toString()}`;

  console.log("Video is being direct played:", directPlayUrl);
  return directPlayUrl;
};

const getDownloadUrl = (
  api: Api,
  itemId: string,
  mediaSource: MediaSourceInfo | undefined,
  sessionId: string | null | undefined,
): StreamResult => {
  if (!mediaSource?.TranscodingUrl) {
    return {
      url: `${api.basePath}/Items/${mediaSource?.Id ?? itemId}/Download?ApiKey=${api.accessToken}`,
      sessionId: sessionId || null,
      mediaSource,
    };
  }

  return {
    url: `${api.basePath}${mediaSource.TranscodingUrl}`,
    sessionId: sessionId || null,
    mediaSource,
  };
};

export const getStreamUrl = async ({
  api,
  item,
  userId,
  startTimeTicks = 0,
  maxStreamingBitrate,
  playSessionId,
  deviceProfile,
  audioStreamIndex = 0,
  subtitleStreamIndex = undefined,
  mediaSourceId,
  deviceId,
}: {
  api: Api | null | undefined;
  item: BaseItemDto | null | undefined;
  userId: string | null | undefined;
  startTimeTicks: number;
  maxStreamingBitrate?: number;
  playSessionId?: string | null;
  deviceProfile: any;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  height?: number;
  mediaSourceId?: string | null;
  deviceId?: string | null;
}): Promise<{
  url: string | null;
  sessionId: string | null;
  mediaSource: MediaSourceInfo | undefined;
  requiredHttpHeaders?: Record<string, string>;
} | null> => {
  if (!api || !userId || !item?.Id) {
    console.warn("Missing required parameters for getStreamUrl");
    return null;
  }

  let mediaSource: MediaSourceInfo | undefined;
  let sessionId: string | null | undefined;

  // Please do not remove this we need this for live TV to be working correctly.
  if (item.Type === BaseItemKind.Program) {
    console.log("Item is of type program...");
    const res = await getMediaInfoApi(api).getPlaybackInfo(
      {
        userId,
        itemId: item.ChannelId!,
      },
      {
        method: "POST",
        params: {
          startTimeTicks: 0,
          isPlayback: true,
          autoOpenLiveStream: true,
          maxStreamingBitrate,
          audioStreamIndex,
        },
        data: {
          deviceProfile,
        },
      },
    );

    sessionId = res.data.PlaySessionId || null;
    mediaSource = res.data.MediaSources?.[0];
    const url = getPlaybackUrl(api, item.ChannelId!, mediaSource, {
      subtitleStreamIndex,
      audioStreamIndex,
      deviceId,
      startTimeTicks: 0,
      maxStreamingBitrate,
      userId,
    });

    return {
      url,
      sessionId: sessionId || null,
      mediaSource,
      requiredHttpHeaders: mediaSource?.RequiredHttpHeaders as
        | Record<string, string>
        | undefined,
    };
  }

  const res = await getMediaInfoApi(api).getPlaybackInfo(
    {
      itemId: item.Id!,
    },
    {
      method: "POST",
      data: {
        userId,
        deviceProfile,
        subtitleStreamIndex,
        startTimeTicks,
        isPlayback: true,
        autoOpenLiveStream: true,
        maxStreamingBitrate,
        audioStreamIndex,
        mediaSourceId,
      },
    },
  );

  if (res.status !== 200) {
    console.error("Error getting playback info:", res.status, res.statusText);
  }

  sessionId = res.data.PlaySessionId || null;
  mediaSource = res.data.MediaSources?.[0];

  const url = getPlaybackUrl(api, item.Id!, mediaSource, {
    subtitleStreamIndex,
    audioStreamIndex,
    deviceId,
    startTimeTicks,
    maxStreamingBitrate,
    userId,
    playSessionId: playSessionId || undefined,
  });

  return {
    url,
    sessionId: sessionId || null,
    mediaSource,
    requiredHttpHeaders: mediaSource?.RequiredHttpHeaders as
      | Record<string, string>
      | undefined,
  };
};

export const getDownloadStreamUrl = async ({
  api,
  item,
  userId,
  maxStreamingBitrate,
  audioStreamIndex = 0,
  subtitleStreamIndex = undefined,
  mediaSourceId,
  audioMode = "auto",
}: {
  api: Api | null | undefined;
  item: BaseItemDto | null | undefined;
  userId: string | null | undefined;
  maxStreamingBitrate?: number;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  mediaSourceId?: string | null;
  audioMode?: AudioTranscodeModeType;
}): Promise<{
  url: string | null;
  sessionId: string | null;
  mediaSource: MediaSourceInfo | undefined;
} | null> => {
  if (!api || !userId || !item?.Id) {
    console.warn("Missing required parameters for getStreamUrl");
    return null;
  }

  const res = await getMediaInfoApi(api).getPlaybackInfo(
    {
      itemId: item.Id!,
    },
    {
      method: "POST",
      data: {
        userId,
        deviceProfile: generateDownloadProfile(audioMode),
        subtitleStreamIndex,
        startTimeTicks: 0,
        isPlayback: true,
        autoOpenLiveStream: true,
        maxStreamingBitrate,
        audioStreamIndex,
        mediaSourceId,
      },
    },
  );

  if (res.status !== 200) {
    console.error("Error getting playback info:", res.status, res.statusText);
  }

  const sessionId = res.data.PlaySessionId || null;
  const mediaSource = res.data.MediaSources?.[0];

  return getDownloadUrl(api, item.Id!, mediaSource, sessionId);
};
