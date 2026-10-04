import type {
  BaseItemDto,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  DOWNLOAD_SUBTITLE_INFIX,
  DOWNLOAD_TRICKPLAY_DIR_SUFFIX,
} from "@/constants/Downloads";

/**
 * One part of a file name, with everything that is not a letter, a digit, "_" or "-" replaced.
 *
 * The names below are built from what the Jellyfin server sends (the item id, the subtitle
 * codec, and numbers that nothing stops from arriving as strings), and they are joined onto
 * Documents as they are. A separator or a ".." segment in one would put the file somewhere else.
 * Real ids, codecs and indexes only use these characters, so the name of a download that is
 * already on disk does not change.
 */
function safeNamePart(value: unknown): string {
  return String(value).replace(/[^A-Za-z0-9_-]/g, "_");
}

/**
 * Generate a safe filename from item metadata: always a plain file name with no dot in it,
 * whatever the server put in the item.
 */
export function generateFilename(item: BaseItemDto): string {
  if (item.Type === "Episode") {
    const season = String(item.ParentIndexNumber || 0).padStart(2, "0");
    const episode = String(item.IndexNumber || 0).padStart(2, "0");
    const seriesName = (item.SeriesName || "Unknown")
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    return safeNamePart(`${seriesName}_s${season}e${episode}`);
  }

  if (item.Type === "Movie") {
    const movieName = (item.Name || "Unknown")
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    const year = item.ProductionYear || "";
    return safeNamePart(`${movieName}_${year}`);
  }

  return safeNamePart(item.Id);
}

/** Name, in Documents, of the local copy of an external subtitle stream. */
export function subtitleFileName(
  item: BaseItemDto,
  stream: MediaStream,
): string {
  const extension = safeNamePart(stream.Codec || "srt");
  return `${generateFilename(item)}${DOWNLOAD_SUBTITLE_INFIX}${safeNamePart(stream.Index)}.${extension}`;
}

/** Name, in Documents, of the folder holding an item's trickplay sheets. */
export function trickplayDirName(item: BaseItemDto): string {
  return `${generateFilename(item)}${DOWNLOAD_TRICKPLAY_DIR_SUFFIX}`;
}

/**
 * Name, in the Live Activity directory, of the poster staged for an item's download. Unlike the
 * names above it is built from the item id for every item type.
 */
export function liveActivityPosterFileName(item: BaseItemDto): string {
  return `${safeNamePart(item.Id)}.jpg`;
}

/**
 * Strip file:// prefix from URI to get plain file path
 * Required for native modules that expect plain paths
 */
export function uriToFilePath(uri: string): string {
  return uri.replace(/^file:\/\//, "");
}

/**
 * Convert plain file path to file:// URI
 * Required for expo-file-system File constructor
 */
export function filePathToUri(path: string): string {
  if (path.startsWith("file://")) {
    return path;
  }
  return `file://${path}`;
}
