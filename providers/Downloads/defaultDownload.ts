import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import type { Bitrate } from "@/components/BitrateSelector";
import type { Settings } from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { getDownloadStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";

export type DefaultDownload = {
  url: string;
  item: BaseItemDto;
  mediaSource: MediaSourceInfo;
  bitrate: Bitrate;
  audioIndex?: number;
  subtitleIndex?: number;
};

/**
 * What a download nobody picked options for fetches: the source, tracks and
 * bitrate the user's settings choose, the same ones a season download uses.
 * The item is fetched whole first, since a list of episodes leaves out the
 * media sources and chapters the download and its offline playback need.
 * Null when the server gives no stream for it.
 */
export const resolveDefaultDownload = async ({
  api,
  userId,
  itemId,
  settings,
}: {
  api: Api;
  userId: string;
  itemId: string;
  settings: Settings;
}): Promise<DefaultDownload | null> => {
  const { data: item } = await getUserLibraryApi(api).getItem({
    itemId,
    userId,
  });
  const { mediaSource, audioIndex, subtitleIndex, bitrate } =
    getDefaultPlaySettings(item, settings);
  const stream = await getDownloadStreamUrl({
    api,
    item,
    userId,
    mediaSourceId: mediaSource?.Id,
    audioStreamIndex: audioIndex ?? -1,
    subtitleStreamIndex: subtitleIndex ?? -1,
    maxStreamingBitrate: bitrate.value,
    audioMode: settings.audioTranscodeMode,
  });
  if (!stream?.url || !stream.mediaSource) return null;
  return {
    url: stream.url,
    item,
    mediaSource: stream.mediaSource,
    bitrate,
    audioIndex,
    subtitleIndex,
  };
};
