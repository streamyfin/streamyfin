import type {
  BaseItemDto,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client/models";
import { escapeRegExp } from "lodash";
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
export function safeNamePart(value: unknown): string {
  return String(value).replace(/[^A-Za-z0-9_-]/g, "_");
}

/**
 * A single file name: no separators and not a relative-path segment. For a name that has to be
 * kept as it is (one read back from storage, one a subtitle provider chose) rather than built.
 */
export function isPlainFileName(name: string | undefined): name is string {
  return !!name && name !== "." && name !== ".." && !/[/\\]/.test(name);
}

/**
 * Generate a safe filename from item metadata: always a plain file name with no dot in it,
 * whatever the server put in the item.
 */
export function generateFilename(item: BaseItemDto): string {
  if (item.Type === "Episode") {
    const season = String(item.ParentIndexNumber || 0).padStart(2, "0");
    const episode = String(item.IndexNumber || 0).padStart(2, "0");
    const seriesName = String(item.SeriesName || "Unknown")
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    return safeNamePart(`${seriesName}_s${season}e${episode}`);
  }

  if (item.Type === "Movie") {
    const movieName = String(item.Name || "Unknown")
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

// The root, a directory of containers and a container: a shorter path has no sibling
// container to have moved from.
const CONTAINER_PATH_MIN_SEGMENTS = 3;

/**
 * Moves a stored location inside Documents onto the Documents directory the app has now.
 *
 * iOS puts the app's data in a container whose path holds a UUID, and an app update can move
 * it to a new one: the files come along, but a location stored as an absolute path or URI
 * still names the old container, and the player gets "No such file or directory" for a
 * download that is on disk. A location already under the current Documents and one outside
 * Documents altogether (a server URL) come back unchanged. The result keeps the stored form,
 * URI or plain path. Callers skip Android, where the directory never moves: its layout of
 * app directories would match another app's.
 */
export function rebaseOntoDocuments(
  stored: string,
  documentsUri: string,
): string {
  return rebaseOntoAppDirectory(stored, documentsUri, documentsUri);
}

/**
 * Moves a stored location inside one of the app's directories onto that directory as the app
 * has it now, as {@link rebaseOntoDocuments} does for Documents.
 *
 * `directoryUri` is the directory now, Documents or one deeper in the container such as
 * Library/Caches. `documentsUri` locates the container: on iOS, Documents sits at its top.
 */
export function rebaseOntoAppDirectory(
  stored: string,
  directoryUri: string,
  documentsUri: string,
): string {
  return appDirectoryRebaser(directoryUri, documentsUri)(stored);
}

/**
 * {@link rebaseOntoAppDirectory} for one directory, with what only depends on the directory
 * worked out once, for a caller that rebases many locations onto it.
 */
export function appDirectoryRebaser(
  directoryUri: string,
  documentsUri: string,
): (stored: string) => string {
  const directory = withoutTrailingSlashes(uriToFilePath(directoryUri));

  // Only the same directory in a sibling container is the old one: the same directory of
  // containers as now (on iOS ".../Containers/Data/Application/"), then any UUID, then the
  // directory's place in the container. A "Documents" anywhere else (a user's own folder, a
  // lookalike layout outside the app) is left alone. "/private/var" is the same directory as
  // "/var" on iOS, so a path stored through either one matches.
  const documents = withoutTrailingSlashes(uriToFilePath(documentsUri));
  const container = withoutPrivate(
    documents.slice(0, documents.lastIndexOf("/")),
  );
  const directoryInContainer = withoutPrivate(directory);
  const segments = container.split("/");
  // Null when the directory is not in the container, or the container has no sibling to have
  // moved from: then nothing outside the directory moves.
  const inSiblingDirectory =
    directoryInContainer.startsWith(`${container}/`) &&
    segments.length >= CONTAINER_PATH_MIN_SEGMENTS
      ? new RegExp(
          `^${escapeRegExp(segments.slice(0, -1).join("/"))}/[^/]+/${escapeRegExp(
            directoryInContainer.slice(container.length + 1),
          )}/`,
        )
      : null;

  return (stored) => {
    if (!stored.startsWith("file://") && !stored.startsWith("/")) return stored;
    const path = uriToFilePath(stored);
    if (path === directory || path.startsWith(`${directory}/`)) return stored;
    if (!inSiblingDirectory) return stored;

    const inSibling = withoutPrivate(path);
    const match = inSiblingDirectory.exec(inSibling);
    if (!match) return stored;

    const rebased = `${directory}/${inSibling.slice(match[0].length)}`;
    return stored.startsWith("file://") ? filePathToUri(rebased) : rebased;
  };
}

function withoutTrailingSlashes(path: string): string {
  return path.replace(/\/+$/, "");
}

function withoutPrivate(path: string): string {
  return path.replace(/^\/private(?=\/)/, "");
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
