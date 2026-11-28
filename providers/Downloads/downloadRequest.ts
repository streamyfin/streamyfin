import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import type { Bitrate } from "@/constants/Playback";
import type { Settings } from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import type { DownloadRequestParams } from "@/utils/jellyfin/media/getStreamUrl";

/** What the download sheet has selected. */
export type SelectedOptions = {
  bitrate: Bitrate;
  mediaSource: MediaSourceInfo | undefined;
  audioIndex: number | undefined;
  subtitleIndex: number;
};

/**
 * Whether a download the user confirmed has to be turned down for want of a
 * media source.
 *
 * A single item downloads the source picked in the sheet, and the server only
 * lists sources for what it can play: a video (a missing episode included, as
 * a placeholder), a song, a live channel. A folder, a photo or a book has none
 * and gets a download button on the item page all the same. The user gets
 * there by pressing download, so it is theirs to be told about and not an
 * error of the app's to report. Several items each resolve their own default
 * source once the download starts, so nothing is asked of them up front.
 */
export const lacksMediaSource = (
  pendingCount: number,
  mediaSource: MediaSourceInfo | null | undefined,
): boolean => pendingCount === 1 && !mediaSource?.Id;

/**
 * The version and tracks one item downloads with, as chosen: an index nobody
 * picked stays unset. The download records these as they are.
 */
export function downloadTracksFor({
  item,
  batch,
  selected,
  settings,
}: {
  item: BaseItemDto;
  batch: boolean;
  selected: SelectedOptions | undefined;
  settings: Settings | null;
}): {
  mediaSource: MediaSourceInfo | undefined;
  audioIndex: number | undefined;
  subtitleIndex: number | undefined;
} {
  if (batch) {
    const defaults = getDefaultPlaySettings(item, settings);
    return {
      mediaSource: defaults.mediaSource ?? undefined,
      audioIndex: defaults.audioIndex,
      subtitleIndex: defaults.subtitleIndex,
    };
  }
  return {
    mediaSource: selected?.mediaSource,
    audioIndex: selected?.audioIndex,
    subtitleIndex: selected?.subtitleIndex,
  };
}

/**
 * The request one item of a download is made with. A single item takes the
 * sheet's choices; a batch (a season, a series) takes each episode's own
 * defaults, since the sheet offers no version or track for several items.
 * The download and the sheet's direct-or-transcode check both build it here,
 * so the check asks about the download that will be made.
 */
export function buildDownloadRequest({
  api,
  userId,
  item,
  batch,
  selected,
  defaultBitrate,
  settings,
}: {
  api: Api;
  userId: string;
  item: BaseItemDto;
  batch: boolean;
  selected: SelectedOptions | undefined;
  defaultBitrate: Bitrate;
  settings: Settings | null;
}): DownloadRequestParams {
  const { mediaSource, audioIndex, subtitleIndex } = downloadTracksFor({
    item,
    batch,
    selected,
    settings,
  });

  return {
    api,
    item,
    userId,
    mediaSourceId: mediaSource?.Id,
    audioStreamIndex: audioIndex ?? -1,
    subtitleStreamIndex: subtitleIndex ?? -1,
    maxStreamingBitrate: (selected?.bitrate || defaultBitrate).value,
    audioMode: settings?.audioTranscodeMode,
  };
}
