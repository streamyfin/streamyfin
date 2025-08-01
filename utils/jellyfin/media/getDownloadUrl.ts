import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getDownloadStreamUrl } from "./getStreamUrl";
import { Bitrate } from "@/components/BitrateSelector";

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
}): Promise<string | null> => {

  // Try check if we can play the item directly
  const streamUrl = await getDownloadStreamUrl({
    api,
    item,
    userId,
    mediaSourceId: mediaSource.Id,
    maxStreamingBitrate: maxBitrate.value,
    audioStreamIndex,
    subtitleStreamIndex,
    deviceId,
  });

  if (maxBitrate.key === "Max" && !streamUrl?.mediaSource?.TranscodingUrl) {
    console.log("Downloading item directly");
    return `${api.basePath}/Items/${item.Id}/Download?api_key=${api.accessToken}`;
  }

  return streamUrl?.url ?? null;
};
