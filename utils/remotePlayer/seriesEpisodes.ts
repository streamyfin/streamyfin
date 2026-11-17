import type { Api } from "@jellyfin/sdk";
import { getShowApi } from "@jellyfin/sdk/lib/utils/api";
import type { QueueEpisode } from "./boundedEpisodeQueue";

/** Every episode of the series the server has a file for, in the order its series page shows them. */
export const seriesEpisodes = async (
  api: Api,
  userId: string,
  seriesId: string,
): Promise<QueueEpisode[]> => {
  const { data } = await getShowApi(api).getEpisodes({
    seriesId,
    userId,
    isMissing: false,
  });
  return (data.Items ?? []).flatMap((episode) =>
    episode.Id
      ? [
          {
            id: episode.Id,
            name: episode.Name ?? null,
            runTimeTicks: episode.RunTimeTicks ?? null,
          },
        ]
      : [],
  );
};
