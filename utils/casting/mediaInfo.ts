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
 */
export const buildCastMediaInfo = ({
  item,
  streamUrl,
  api,
}: {
  item: BaseItemDto;
  streamUrl: string;
  api: Api;
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

  const metadata =
    item.Type === "Episode"
      ? {
          type: "tvShow" as const,
          title: item.Name || "",
          episodeNumber: item.IndexNumber || 0,
          seasonNumber: item.ParentIndexNumber || 0,
          seriesTitle: item.SeriesName || "",
          images: buildImages([
            getParentBackdropImageUrl({
              api,
              item,
              quality: 90,
              width: 2000,
            }),
          ]),
        }
      : item.Type === "Movie"
        ? {
            type: "movie" as const,
            title: item.Name || "",
            subtitle: item.Overview || "",
            images: buildImages([
              getPrimaryImageUrl({
                api,
                item,
                quality: 90,
                width: 2000,
              }),
            ]),
          }
        : {
            type: "generic" as const,
            title: item.Name || "",
            subtitle: item.Overview || "",
            images: buildImages([
              getPrimaryImageUrl({
                api,
                item,
                quality: 90,
                width: 2000,
              }),
            ]),
          };

  return {
    contentId: itemId,
    contentUrl: streamUrl,
    contentType: "video/mp4",
    streamType: MediaStreamType.BUFFERED,
    streamDuration,
    customData: item,
    metadata,
  };
};
