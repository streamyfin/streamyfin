import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { Bitrate } from "@/components/BitrateSelector";
import { generateDeviceProfile } from "@/utils/profiles/native";
import { getDownloadStreamUrl, getStreamUrl } from "./getStreamUrl";

export const getDownloadUrl = async ({
  api,
  item,
  userId,
  mediaSource,
  maxBitrate,
  audioStreamIndex,
  subtitleStreamIndex,
  deviceId,
}: {
  api: Api;
  item: BaseItemDto;
  userId: string;
  mediaSource: MediaSourceInfo;
  maxBitrate: Bitrate;
  audioStreamIndex: number;
  subtitleStreamIndex: number;
  deviceId: string;
}): Promise<{
  url: string | null;
  mediaSource: MediaSourceInfo | null;
} | null> => {
  const streamDetails = await getStreamUrl({
    api,
    item,
    userId,
    startTimeTicks: 0,
    mediaSourceId: mediaSource.Id,
    maxStreamingBitrate: maxBitrate.value,
    audioStreamIndex,
    subtitleStreamIndex,
    deviceId,
    deviceProfile: generateDeviceProfile(),
  });

  if (maxBitrate.key === "Max" && !streamDetails?.mediaSource?.TranscodingUrl) {
    console.log("Downloading item directly");
    return {
      url: `${api.basePath}/Items/${item.Id}/Download?api_key=${api.accessToken}`,
      mediaSource: streamDetails?.mediaSource ?? null,
    };
  }

  const downloadStreamDetails = await getDownloadStreamUrl({
    api,
    item,
    userId,
    mediaSourceId: mediaSource.Id,
    deviceId,
    maxStreamingBitrate: maxBitrate.value,
    audioStreamIndex,
    subtitleStreamIndex,
  });

  return {
    url: downloadStreamDetails?.url ?? null,
    mediaSource: downloadStreamDetails?.mediaSource ?? null,
  };
};
