import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getShowApi } from "@jellyfin/sdk/lib/utils/api";
import type { QueueEpisode } from "./boundedEpisodeQueue";

/** An episode of the series: what the bound needs, and the server's item for the episode list on screen. */
export interface SeriesEpisode extends QueueEpisode {
  item: BaseItemDto;
}

/** Every episode of the series the server has a file for, in the order its series page shows them. */
export const seriesEpisodes = async (
  api: Api,
  userId: string,
  seriesId: string,
): Promise<SeriesEpisode[]> => {
  const { data } = await getShowApi(api).getEpisodes({
    seriesId,
    userId,
    isMissing: false,
  });
  return (data.Items ?? []).flatMap((item) =>
    item.Id
      ? [
          {
            id: item.Id,
            name: item.Name ?? null,
            runTimeTicks: item.RunTimeTicks ?? null,
            item,
          },
        ]
      : [],
  );
};
