import { SelectedOptions } from "@/components/ItemContent";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { RemoteMediaClient, WebImage } from "react-native-google-cast";

export function chromecastLoadMedia({
  client,
  item,
  contentUrl,
  images,
  playbackOptions,
}: {
  client: RemoteMediaClient;
  item: BaseItemDto;
  contentUrl: string;
  images: WebImage[];
  playbackOptions?: SelectedOptions;
}) {
  return client.loadMedia({
    mediaInfo: {
      contentId: item.Id,
      contentUrl,
      contentType: "video/mp4",
      customData: {
        playbackOptions,
      },
      metadata:
        item.Type === "Episode"
          ? {
              type: "tvShow",
              title: item.Name || "",
              episodeNumber: item.IndexNumber || 0,
              seasonNumber: item.ParentIndexNumber || 0,
              seriesTitle: item.SeriesName || "",
              images,
            }
          : item.Type === "Movie"
          ? {
              type: "movie",
              title: item.Name || "",
              subtitle: item.Overview || "",
              images,
            }
          : {
              type: "generic",
              title: item.Name || "",
              subtitle: item.Overview || "",
              images,
            },
    },
    startTime: 0,
  });
}
