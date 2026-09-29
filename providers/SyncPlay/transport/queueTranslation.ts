import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto, UserDto } from "@jellyfin/sdk/lib/generated-client";
import type { ItemsApiGetItemsRequest } from "@jellyfin/sdk/lib/generated-client/api/items-api";
import {
  getItemsApi,
  getTvShowsApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { SYNC_PLAY_QUEUE_LIMIT } from "@/constants/SyncPlay";

export type TranslateOptions = {
  ids?: string[];
  shuffle?: boolean;
  queryOptions?: ItemsApiGetItemsRequest;
};

async function queryItems(
  api: Api,
  user: UserDto,
  params: ItemsApiGetItemsRequest,
) {
  const response = await getItemsApi(api).getItems({
    limit: SYNC_PLAY_QUEUE_LIMIT,
    fields: ["Chapters", "Trickplay"],
    excludeLocationTypes: ["Virtual"],
    enableTotalRecordCount: false,
    collapseBoxSetItems: false,
    ...params,
    userId: user.Id,
  });
  return response.data.Items ?? [];
}

export async function getItemsForPlayback(
  api: Api,
  user: UserDto,
  ids: string[],
): Promise<BaseItemDto[]> {
  if (!ids.length) return [];
  if (ids.length > 1) return queryItems(api, user, { ids });
  const response = await getUserLibraryApi(api).getItem({
    userId: user.Id,
    itemId: ids[0],
  });
  return response.data ? [response.data] : [];
}

/** Expand outgoing containers only; incoming queues already contain exact server slots. */
export async function translateItemsForPlayback(
  api: Api,
  user: UserDto,
  items: BaseItemDto[],
  options: TranslateOptions = {},
): Promise<BaseItemDto[]> {
  if (!items.length) return [];
  const ordered =
    items.length > 1 && options.ids
      ? [...items].sort(
          (a, b) =>
            options.ids!.indexOf(a.Id ?? "") - options.ids!.indexOf(b.Id ?? ""),
        )
      : items;
  const first = ordered[0];
  if (first.Type === "Program" && first.ChannelId) {
    return getItemsForPlayback(api, user, [first.ChannelId]);
  }
  if (first.Type === "Playlist") {
    return queryItems(api, user, {
      parentId: first.Id,
      sortBy: options.shuffle ? ["Random"] : undefined,
    });
  }
  if (first.IsFolder) {
    return queryItems(api, user, {
      filters: ["IsNotFolder"],
      recursive: true,
      parentId: first.Id,
      mediaTypes: ["Audio", "Video"],
      sortBy: options.shuffle
        ? ["Random"]
        : first.Type === "BoxSet"
          ? ["SortName"]
          : undefined,
      ...options.queryOptions,
    });
  }
  if (
    first.Type === "Episode" &&
    ordered.length === 1 &&
    user.Configuration?.EnableNextEpisodeAutoPlay &&
    first.SeriesId
  ) {
    const response = await getTvShowsApi(api).getEpisodes({
      seriesId: first.SeriesId,
      userId: user.Id,
      isMissing: false,
      fields: ["Chapters", "Trickplay"],
    });
    const episodes = response.data.Items ?? [];
    const index = episodes.findIndex((episode) => episode.Id === first.Id);
    return index < 0 ? [] : episodes.slice(index);
  }
  return ordered;
}
