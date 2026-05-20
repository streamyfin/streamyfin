/**
 * Shared helper to build Chromecast media metadata.
 * Eliminates duplication between PlayButton, casting-player reloadWithSettings, and loadEpisode.
 */

import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { MediaStreamType } from "react-native-google-cast";
import { getParentBackdropImageUrl } from "@/utils/jellyfin/image/getParentBackdropImageUrl";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

/**
 * Build a MediaInfo object suitable for `remoteMediaClient.loadMedia()`.
 *
 * NOTE on contentType: Chromecast Default Media Receiver auto-detects HLS/DASH
 * from the URL. Setting contentType to "application/x-mpegurl" or "application/dash+xml"
 * actually BREAKS playback on many receivers. Always use "video/mp4" unless
 * you have a custom receiver that explicitly handles other MIME types.
 */
export const buildCastMediaInfo = ({
  item,
  streamUrl,
  api,
  contentType,
  isLive = false,
}: {
  item: BaseItemDto;
  streamUrl: string;
  api: Api;
  /** Override MIME type. Defaults to "video/mp4" which works for all stream types on Default Media Receiver. */
  contentType?: string;
  /** Set true for live TV streams to use MediaStreamType.LIVE. */
  isLive?: boolean;
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

  // Build a slim customData payload with only the fields the casting-player needs.
  // Sending the full BaseItemDto can exceed the Cast protocol's ~64KB message limit,
  // especially for movies with many chapters, media sources, and people.
  const slimCustomData: Partial<BaseItemDto> = {
    Id: item.Id,
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
    MediaStreams: item.MediaStreams,
    MediaSources: item.MediaSources?.map((src) => ({
      Id: src.Id,
      Bitrate: src.Bitrate,
      Container: src.Container,
      Name: src.Name,
      DefaultAudioStreamIndex: src.DefaultAudioStreamIndex,
      DefaultSubtitleStreamIndex: src.DefaultSubtitleStreamIndex,
    })),
    UserData: item.UserData
      ? { PlaybackPositionTicks: item.UserData.PlaybackPositionTicks }
      : undefined,
  };

  return {
    contentId: itemId,
    contentUrl: streamUrl,
    contentType: contentType || "video/mp4",
    streamType: isLive ? MediaStreamType.LIVE : MediaStreamType.BUFFERED,
    streamDuration,
    customData: slimCustomData,
    metadata,
  };
};
