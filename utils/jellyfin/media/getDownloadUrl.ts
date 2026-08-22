import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { Bitrate } from "@/components/BitrateSelector";
import { logAndCaptureError } from "@/utils/log";
import {
  type AudioTranscodeModeType,
  generateDeviceProfile,
} from "../../profiles/native";
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
  audioMode = "auto",
}: {
  api: Api;
  item: BaseItemDto;
  userId: string;
  mediaSource: MediaSourceInfo;
  maxBitrate: Bitrate;
  audioStreamIndex: number;
  subtitleStreamIndex: number;
  deviceId: string;
  audioMode?: AudioTranscodeModeType;
}): Promise<{
  url: string | null;
  mediaSource: MediaSourceInfo | null;
} | null> => {
  // getStreamUrl throws on failed negotiation (no media source). The
  // download UI handles a null url per item (alert + continue with the
  // rest of a season), so map the throw back to null here — an unhandled
  // rejection out of DownloadItem's setTimeout would fail silently and
  // abort the whole batch.
  let streamDetails: Awaited<ReturnType<typeof getStreamUrl>>;
  try {
    streamDetails = await getStreamUrl({
      api,
      item,
      userId,
      startTimeTicks: 0,
      mediaSourceId: mediaSource.Id,
      maxStreamingBitrate: maxBitrate.value,
      audioStreamIndex,
      subtitleStreamIndex,
      deviceId,
      deviceProfile: generateDeviceProfile({ audioMode }),
    });
  } catch (error) {
    logAndCaptureError("Getting download stream URL failed", error, {
      itemType: item.Type,
    });
    return null;
  }

  if (maxBitrate.key === "Max" && !streamDetails?.mediaSource?.TranscodingUrl) {
    console.log("Downloading item directly");
    return {
      url: `${api.basePath}/Items/${mediaSource.Id}/Download?ApiKey=${api.accessToken}`,
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
    audioMode,
  });

  return {
    url: downloadStreamDetails?.url ?? null,
    mediaSource: downloadStreamDetails?.mediaSource ?? null,
  };
};
