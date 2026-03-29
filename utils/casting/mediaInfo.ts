/**
 * Shared helper to build Chromecast media metadata.
 * Eliminates duplication between PlayButton, casting-player reloadWithSettings, and loadEpisode.
 *
 * The sender passes item info and playback settings in customData.
 * The receiver calls getPlaybackInfo itself to get the stream URL, so there is
 * no stream URL, session ID, or transcodingUrl on the sender side.
 */

import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { MediaStreamType } from "react-native-google-cast";
import { getParentBackdropImageUrl } from "@/utils/jellyfin/image/getParentBackdropImageUrl";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

export const buildCastMediaInfo = ({
  item,
  api,
  contentType,
  isLive = false,
  startTimeTicks,
  audioStreamIndex,
  subtitleStreamIndex,
  maxStreamingBitrate,
  mediaSourceId,
  enableH265 = false,
}: {
  item: BaseItemDto;
  api: Api;
  contentType?: string;
  /** Set true for live TV streams to use MediaStreamType.LIVE. */
  isLive?: boolean;
  startTimeTicks?: number;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  maxStreamingBitrate?: number;
  mediaSourceId?: string | null;
  /** Pass the user's H265 setting so the receiver chooses the right device profile. */
  enableH265?: boolean;
}) => {
  if (!item.Id) {
    throw new Error("Missing item.Id for media load — cannot build contentId");
  }

  const itemId: string = item.Id;
  const streamDuration = item.RunTimeTicks
    ? item.RunTimeTicks / 10000000
    : undefined;

  const buildImages = (urls: (string | null | undefined)[]) =>
    urls.filter(Boolean).map((url) => ({ url: url as string }));

  const buildItemMetadata = () => {
    if (item.Type === "Episode") {
      return {
        type: "tvShow" as const,
        title: item.Name || "",
        episodeNumber: item.IndexNumber || 0,
        seasonNumber: item.ParentIndexNumber || 0,
        seriesTitle: item.SeriesName || "",
        images: buildImages([
          getParentBackdropImageUrl({ api, item, quality: 90, width: 2000 }),
        ]),
      };
    }

    if (item.Type === "Movie") {
      return {
        type: "movie" as const,
        title: item.Name || "",
        subtitle: item.Overview || "",
        images: buildImages([
          getPrimaryImageUrl({ api, item, quality: 90, width: 2000 }),
        ]),
      };
    }

    return {
      type: "generic" as const,
      title: item.Name || "",
      subtitle: item.Overview || "",
      images: buildImages([
        getPrimaryImageUrl({ api, item, quality: 90, width: 2000 }),
      ]),
    };
  };

  const metadata = buildItemMetadata();

  // customData is read by the receiver (for stream init) and by the sender UI
  // (via mediaStatus.mediaInfo.customData) for displaying item info.
  const customData: Record<string, unknown> = {
    // Playback settings — receiver passes these to getPlaybackInfo
    Id: item.Id,
    startTimeTicks: startTimeTicks ?? 0,
    audioStreamIndex,
    subtitleStreamIndex,
    maxStreamingBitrate,
    mediaSourceId,
    enableH265,
    // Display metadata
    Name: item.Name,
    Type: item.Type,
    SeriesName: item.SeriesName,
    SeriesId: item.SeriesId,
    SeasonId: item.SeasonId,
    IndexNumber: item.IndexNumber,
    ParentIndexNumber: item.ParentIndexNumber,
    ImageTags: item.ImageTags,
    RunTimeTicks: item.RunTimeTicks,
    Overview: item.Overview,
    MediaSources: item.MediaSources?.map((src) => ({
      Id: src.Id,
      Bitrate: src.Bitrate,
      Container: src.Container,
      Name: src.Name,
    })),
    UserData: item.UserData
      ? { PlaybackPositionTicks: item.UserData.PlaybackPositionTicks }
      : undefined,
  };

  return {
    contentId: itemId,
    // Empty placeholder — the receiver's LOAD interceptor replaces this with
    // the real stream URL after calling getPlaybackInfo itself.
    contentUrl: "",
    contentType: contentType || "video/mp4",
    streamType: isLive ? MediaStreamType.LIVE : MediaStreamType.BUFFERED,
    streamDuration,
    customData,
    metadata,
  };
};
