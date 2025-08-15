import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getMediaInfoApi } from "@jellyfin/sdk/lib/utils/api";
import download from "@/utils/profiles/download";

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
} | null> => {
  if (!api || !userId || !item?.Id) {
    console.warn("Missing required parameters for getStreamUrl");
    return null;
  }

  let mediaSource: MediaSourceInfo | undefined;
  let sessionId: string | null | undefined;

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
  let transcodeUrl = mediaSource?.TranscodingUrl;

  if (transcodeUrl) {
    // We need to change the subtitle method to hls for the transcoded url.
    if (subtitleStreamIndex === -1) {
      transcodeUrl = transcodeUrl.replace(
        "SubtitleMethod=Encode",
        "SubtitleMethod=Hls",
      );
    }
    console.log("Video is being transcoded:", transcodeUrl);
    return {
      url: `${api.basePath}${transcodeUrl}`,
      sessionId,
      mediaSource,
    };
  }

  const streamParams = new URLSearchParams({
    static: "true",
    container: "mp4",
    mediaSourceId: mediaSource?.Id || "",
    subtitleStreamIndex: subtitleStreamIndex?.toString() || "",
    audioStreamIndex: audioStreamIndex?.toString() || "",
    deviceId: deviceId || api.deviceInfo.id,
    api_key: api.accessToken,
    startTimeTicks: startTimeTicks.toString(),
    maxStreamingBitrate: maxStreamingBitrate?.toString() || "",
    userId: userId,
  });

  const directPlayUrl = `${
    api.basePath
  }/Videos/${item.Id}/stream?${streamParams.toString()}`;

  console.log("Video is being direct played:", directPlayUrl);

  return {
    url: directPlayUrl,
    sessionId: sessionId || playSessionId || null,
    mediaSource,
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
  deviceId,
}: {
  api: Api | null | undefined;
  item: BaseItemDto | null | undefined;
  userId: string | null | undefined;
  maxStreamingBitrate?: number;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  mediaSourceId?: string | null;
  deviceId?: string | null;
}): Promise<{
  url: string | null;
  sessionId: string | null;
  mediaSource: MediaSourceInfo | undefined;
} | null> => {
  if (!api || !userId || !item?.Id) {
    console.warn("Missing required parameters for getStreamUrl");
    return null;
  }

  let mediaSource: MediaSourceInfo | undefined;
  let sessionId: string | null | undefined;

  const res = await getMediaInfoApi(api).getPlaybackInfo(
    {
      itemId: item.Id!,
    },
    {
      method: "POST",
      data: {
        userId,
        deviceProfile: download,
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

  sessionId = res.data.PlaySessionId || null;
  mediaSource = res.data.MediaSources?.[0];
  let transcodeUrl = mediaSource?.TranscodingUrl;

  if (transcodeUrl) {
    transcodeUrl = transcodeUrl.replace("master.m3u8", "stream");
    console.log("Video is being transcoded:", transcodeUrl);
    return {
      url: `${api.basePath}${transcodeUrl}`,
      sessionId,
      mediaSource,
    };
  }

  const downloadParams = {
    // We need to disable static so we can have a remux with subtitle.
    subtitleMethod: "Embed",
    enableSubtitlesInManifest: true,
    allowVideoStreamCopy: true,
    allowAudioStreamCopy: true,
    playSessionId: sessionId || "",
  };

  const streamParams = new URLSearchParams({
    static: "false",
    container: "ts",
    mediaSourceId: mediaSource?.Id || "",
    subtitleStreamIndex: subtitleStreamIndex?.toString() || "",
    audioStreamIndex: audioStreamIndex?.toString() || "",
    deviceId: deviceId || api.deviceInfo.id,
    api_key: api.accessToken,
    startTimeTicks: "0",
    maxStreamingBitrate: maxStreamingBitrate?.toString() || "",
    userId: userId,
  });

  Object.entries(downloadParams).forEach(([key, value]) => {
    streamParams.append(key, value.toString());
  });

  const directPlayUrl = `${
    api.basePath
  }/Videos/${item.Id}/stream?${streamParams.toString()}`;

  return {
    url: directPlayUrl,
    sessionId: sessionId || null,
    mediaSource,
  };
};
