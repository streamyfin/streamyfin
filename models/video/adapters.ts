import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  detectMediaSource,
  getImageUrl,
  getStreamUrl,
  toBaseMediaEntity,
} from "../common/adapters";
import type {
  ContainerDownloadInfo,
  Person,
  VideoDownloadInfo,
} from "../common/types";
import { MediaSource as MediaSourceEnum } from "../common/types";
import type { Episode, Movie, Program, Season, Series } from "./types";

/**
 * Convert Jellyfin people to Person domain type
 */
function mapPeople(
  people: BaseItemDto["People"],
  type: string,
  api?: Api,
): Person[] | undefined {
  if (!people) return undefined;

  return people
    .filter((p) => p.Type === type)
    .map((p) => ({
      id: p.Id,
      name: p.Name!,
      role: p.Role ?? undefined,
      type: p.Type,
      primaryImageUrl:
        p.Id && api
          ? getImageUrl(
              {
                Id: p.Id,
                ImageTags: p.PrimaryImageTag
                  ? { Primary: p.PrimaryImageTag }
                  : undefined,
              } as BaseItemDto,
              "Primary",
              api,
              200,
            )
          : undefined,
    }));
}

/**
 * Convert BaseItemDto to Movie domain model
 */
export function toMovie(
  item: BaseItemDto,
  downloadInfo?: VideoDownloadInfo | any,
  api?: Api,
): Movie {
  const source = detectMediaSource(item, downloadInfo);

  return {
    ...toBaseMediaEntity(item, downloadInfo, api),
    source,
    serverId: item.ServerId || api?.basePath || "unknown",

    // Playable media fields
    duration: item.RunTimeTicks ? item.RunTimeTicks / 10000000 : undefined,
    streamUrl:
      source === MediaSourceEnum.Online ? getStreamUrl(item, api) : undefined,
    localPath: downloadInfo?.filePath,
    mediaSources: item.MediaSources ?? undefined,

    // Movie-specific
    studios: item.Studios?.map((s) => s.Name!).filter(Boolean),
    directors: mapPeople(item.People, "Director", api),
    actors: mapPeople(item.People, "Actor", api),
    writers: mapPeople(item.People, "Writer", api),
    producers: mapPeople(item.People, "Producer", api),
    taglines: item.Taglines ?? undefined,
    originalTitle: item.OriginalTitle ?? undefined,

    downloadInfo,
  };
}

/**
 * Convert BaseItemDto to Episode domain model
 */
export function toEpisode(
  item: BaseItemDto,
  downloadInfo?: VideoDownloadInfo | any,
  api?: Api,
): Episode {
  const source = detectMediaSource(item, downloadInfo);

  return {
    ...toBaseMediaEntity(item, downloadInfo, api),
    source,
    serverId: item.ServerId || api?.basePath || "unknown",

    // Playable media fields
    duration: item.RunTimeTicks ? item.RunTimeTicks / 10000000 : undefined,
    streamUrl:
      source === MediaSourceEnum.Online ? getStreamUrl(item, api) : undefined,
    localPath: downloadInfo?.filePath,
    mediaSources: item.MediaSources ?? undefined,

    // Episode-specific
    seriesId: item.SeriesId ?? undefined,
    seriesName: item.SeriesName ?? undefined,
    seasonId: item.SeasonId ?? undefined,
    seasonNumber: item.ParentIndexNumber ?? undefined,
    episodeNumber: item.IndexNumber ?? undefined,

    downloadInfo,
  };
}

/**
 * Convert BaseItemDto to Season domain model
 */
export function toSeason(
  item: BaseItemDto,
  downloadInfo?: ContainerDownloadInfo | any,
  api?: Api,
): Season {
  const source = detectMediaSource(item, downloadInfo);

  return {
    ...toBaseMediaEntity(item, downloadInfo, api),
    source,
    serverId: item.ServerId || api?.basePath || "unknown",

    childCount: item.ChildCount ?? undefined,
    seriesId: item.SeriesId ?? undefined,
    seriesName: item.SeriesName ?? undefined,
    seasonNumber: item.IndexNumber ?? undefined,
    episodeCount: item.ChildCount ?? undefined,

    downloadInfo,
  };
}

/**
 * Convert BaseItemDto to Series domain model
 */
export function toSeries(
  item: BaseItemDto,
  downloadInfo?: ContainerDownloadInfo | any,
  api?: Api,
): Series {
  const source = detectMediaSource(item, downloadInfo);

  return {
    ...toBaseMediaEntity(item, downloadInfo, api),
    source,
    serverId: item.ServerId || api?.basePath || "unknown",

    childCount: item.ChildCount ?? undefined,
    seasonCount: item.ChildCount ?? undefined,
    episodeCount: item.RecursiveItemCount ?? undefined,
    status: item.Status ?? undefined,
    airDays: item.AirDays ?? undefined,
    airTime: item.AirTime ?? undefined,
    endDate: item.EndDate ? new Date(item.EndDate) : undefined,

    downloadInfo,
  };
}

/**
 * Convert BaseItemDto to Program domain model (Live TV)
 */
export function toProgram(
  item: BaseItemDto,
  downloadInfo?: VideoDownloadInfo | any,
  api?: Api,
): Program {
  const source = detectMediaSource(item, downloadInfo);

  return {
    ...toBaseMediaEntity(item, downloadInfo, api),
    source,
    serverId: item.ServerId || api?.basePath || "unknown",

    // Playable media fields
    duration: item.RunTimeTicks ? item.RunTimeTicks / 10000000 : undefined,
    streamUrl:
      source === MediaSourceEnum.Online ? getStreamUrl(item, api) : undefined,
    localPath: downloadInfo?.filePath,
    mediaSources: item.MediaSources ?? undefined,

    // Program-specific
    channelId: item.ChannelId ?? undefined,
    channelName: item.ChannelName ?? undefined,
    startDate: item.StartDate ? new Date(item.StartDate) : undefined,
    endDate: item.EndDate ? new Date(item.EndDate) : undefined,
    isLive: item.IsLive ?? undefined,

    downloadInfo,
  };
}
