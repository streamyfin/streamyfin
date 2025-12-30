import type { BaseMediaEntity } from "../common/types";
import type { Episode, Movie, Program, Season, Series } from "./types";

/**
 * Type guard for Movie
 */
export function isMovie(entity: BaseMediaEntity): entity is Movie {
  return entity.jellyfinItem.Type === "Movie";
}

/**
 * Type guard for Episode
 */
export function isEpisode(entity: BaseMediaEntity): entity is Episode {
  return entity.jellyfinItem.Type === "Episode";
}

/**
 * Type guard for Season
 */
export function isSeason(entity: BaseMediaEntity): entity is Season {
  return entity.jellyfinItem.Type === "Season";
}

/**
 * Type guard for Series
 */
export function isSeries(entity: BaseMediaEntity): entity is Series {
  return entity.jellyfinItem.Type === "Series";
}

/**
 * Type guard for Program (Live TV)
 */
export function isProgram(entity: BaseMediaEntity): entity is Program {
  return entity.jellyfinItem.Type === "Program";
}

/**
 * Type guard for any video content
 */
export function isVideoContent(
  entity: BaseMediaEntity,
): entity is Movie | Episode | Program {
  const type = entity.jellyfinItem.Type;
  return type === "Movie" || type === "Episode" || type === "Program";
}

/**
 * Type guard for video containers
 */
export function isVideoContainer(
  entity: BaseMediaEntity,
): entity is Season | Series {
  const type = entity.jellyfinItem.Type;
  return type === "Season" || type === "Series";
}
