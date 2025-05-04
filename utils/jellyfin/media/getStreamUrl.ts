import generateDeviceProfile from "@/utils/profiles/native";
import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
  PlaybackInfoResponse,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getMediaInfoApi } from "@jellyfin/sdk/lib/utils/api";
import { Alert } from "react-native";

export const getStreamUrl = async ({
  api,
  item,
  userId,
  startTimeTicks = 0,
  maxStreamingBitrate,
  playSessionId,
  deviceProfile = generateDeviceProfile(),
  audioStreamIndex = 0,
  subtitleStreamIndex = undefined,
  mediaSourceId,
  download = false,
  deviceId,
}: {
  api: Api | null | undefined;
  item: BaseItemDto | null | undefined;
  userId: string | null | undefined;
  startTimeTicks: number;
  maxStreamingBitrate?: number;
  playSessionId?: string | null;
  deviceProfile?: any;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  height?: number;
  mediaSourceId?: string | null;
  download?: bool;
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
  mediaSource = res.data.MediaSources[0];
  let transcodeUrl = mediaSource.TranscodingUrl;

  if (transcodeUrl) {
    if (download) {
      transcodeUrl = transcodeUrl.replace("master.m3u8", "stream.mp4");
    }
    console.log("Video is being transcoded:", transcodeUrl);
    return {
      url: `${api.basePath}${transcodeUrl}`,
      sessionId,
      mediaSource,
    };
  }

  let downloadParams = {};

  if (download) {
    // We need to disable static so we can have a remux with subtitle.
    downloadParams = {
      subtitleMethod: "Embed",
      enableSubtitlesInManifest: true,
      static: "false",
      allowVideoStreamCopy: true,
      allowAudioStreamCopy: true,
      playSessionId: sessionId || "",
    };
  }

  const streamParams = new URLSearchParams({
    static: "true",
    mediaSourceId: mediaSource?.Id || "",
    subtitleStreamIndex: subtitleStreamIndex?.toString() || "",
    audioStreamIndex: audioStreamIndex?.toString() || "",
    deviceId: deviceId || api.deviceInfo.id,
    api_key: api.accessToken,
    startTimeTicks: startTimeTicks.toString(),
    maxStreamingBitrate: maxStreamingBitrate?.toString() || "",
    userId: userId || "",
    ...downloadParams,
  });

  const directPlayUrl = `${
    api.basePath
  }/Videos/${item.Id}/stream.mp4?${streamParams.toString()}`;

  console.log("Video is being direct played:", directPlayUrl);

  return {
    url: directPlayUrl,
    sessionId: sessionId || playSessionId,
    mediaSource,
  };
};
