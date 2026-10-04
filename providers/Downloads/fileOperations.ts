import { Directory, File, Paths } from "expo-file-system";
import { getAllDownloadedItems, getDownloadedItemById } from "./database";
import { getPendingDownloads, type PendingDownload } from "./pendingDownloads";
import type { DownloadedItem } from "./types";
import { filePathToUri } from "./utils";

/**
 * Last path segment of `location`, or undefined when it is empty or a relative-path segment.
 * A trailing slash (a `Directory.uri`) is ignored.
 */
function lastSegment(location: string): string | undefined {
  const name = location.split("/").filter(Boolean).pop();
  return name && name !== "." && name !== ".." ? name : undefined;
}

/** A single file name: no separators and not a relative-path segment. */
function isPlainFileName(name: string): boolean {
  return name !== "" && name !== "." && name !== ".." && !/[/\\]/.test(name);
}

/**
 * Names of the sidecar files the app writes next to a download (see additionalDownloads.ts).
 * The cleanup deletes only these: a subtitle whose download failed still carries the server's
 * DeliveryUrl, and its last segment is a name the server chose, not one of ours.
 */
const SUBTITLE_NAME_MARKER = "_subtitle_";
const TRICKPLAY_DIR_SUFFIX = "_trickplay";

/** Name of the local subtitle file a stream points at, or undefined if it is not one of ours. */
function subtitleFileName(
  stream: NonNullable<DownloadedItem["mediaSource"]["MediaStreams"]>[number],
): string | undefined {
  if (
    stream.Type !== "Subtitle" ||
    stream.DeliveryMethod !== "External" ||
    // The app rewrites DeliveryUrl to a file:// URI once it has the file.
    !stream.DeliveryUrl?.startsWith("file://")
  ) {
    return undefined;
  }
  const name = lastSegment(stream.DeliveryUrl);
  return name?.includes(SUBTITLE_NAME_MARKER) ? name : undefined;
}

/**
 * Name of the trickplay folder in a stored path. The path is a Directory.uri, which ends in a
 * slash: a plain split().pop() yields "" and used to skip the folder.
 */
function trickplayDirName(path: string): string | undefined {
  const name = lastSegment(path);
  return name?.endsWith(TRICKPLAY_DIR_SUFFIX) ? name : undefined;
}

/**
 * Delete a video file and all associated files (subtitles, trickplay, etc.)
 */
export function deleteVideoFile(filePath: string): void {
  try {
    const videoFile = new File(filePathToUri(filePath));
    if (videoFile.exists) {
      videoFile.delete();
      console.log(`[DELETE] Video file deleted: ${filePath}`);
    }
  } catch (error) {
    console.error("Failed to delete video file:", error);
    throw error;
  }
}

/**
 * Delete all associated files for a downloaded item
 * Includes: video, subtitles, trickplay images
 */
export function deleteAllAssociatedFiles(
  item: Pick<DownloadedItem, "mediaSource" | "trickPlayData"> &
    Partial<Pick<DownloadedItem, "videoFilePath">>,
): void {
  try {
    // Delete video file
    if (item.videoFilePath) {
      deleteVideoFile(item.videoFilePath);
    }

    // Delete subtitle files
    for (const stream of item.mediaSource?.MediaStreams ?? []) {
      const subtitleFilename = subtitleFileName(stream);
      if (!subtitleFilename) continue;
      try {
        const subtitleFile = new File(Paths.document, subtitleFilename);
        if (subtitleFile.exists) {
          subtitleFile.delete();
          console.log(`[DELETE] Subtitle deleted: ${subtitleFilename}`);
        }
      } catch (error) {
        console.error("[DELETE] Failed to delete subtitle:", error);
      }
    }

    // Delete trickplay directory
    const trickplayName = item.trickPlayData?.path
      ? trickplayDirName(item.trickPlayData.path)
      : undefined;
    if (trickplayName) {
      try {
        const trickplayDir = new Directory(Paths.document, trickplayName);
        if (trickplayDir.exists) {
          trickplayDir.delete();
          console.log(`[DELETE] Trickplay directory deleted: ${trickplayName}`);
        }
      } catch (error) {
        console.error("[DELETE] Failed to delete trickplay directory:", error);
      }
    }
  } catch (error) {
    console.error("[DELETE] Error deleting associated files:", error);
    throw error;
  }
}

type FileOwner = {
  videoFileName?: string;
  mediaSource?: PendingDownload["mediaSource"];
  trickPlayData?: PendingDownload["trickPlayData"];
};

/** Every file name `owner` has on disk. */
function ownedFileNames(owner: FileOwner): string[] {
  const names: string[] = [];
  if (owner.videoFileName) names.push(owner.videoFileName);
  for (const stream of owner.mediaSource?.MediaStreams ?? []) {
    const name = subtitleFileName(stream);
    if (name) names.push(name);
  }
  const trickplay = owner.trickPlayData?.path
    ? trickplayDirName(owner.trickPlayData.path)
    : undefined;
  if (trickplay) names.push(trickplay);
  return names;
}

/**
 * File names in use by finished downloads and by pending downloads other than `record`.
 * generateFilename maps different items to the same name (movies of one title and year, episodes
 * of series that normalise alike), so an abandoned download can share files with another one.
 */
function namesUsedByOtherDownloads(record: PendingDownload): Set<string> {
  const used = new Set<string>();
  for (const download of getAllDownloadedItems()) {
    for (const name of ownedFileNames(download)) used.add(name);
  }
  for (const pending of getPendingDownloads()) {
    if (pending.itemId === record.itemId) continue;
    for (const name of ownedFileNames(pending)) used.add(name);
  }
  return used;
}

/**
 * Delete what an abandoned download left on disk.
 *
 * Subtitles and trickplay sheets are written before the video is handed to native, so a download
 * that is cancelled or fails has already put them in Documents. On Android the partial video sits
 * at its final path as well; iOS stages the transfer in a temp file, so there is nothing to
 * remove there and the existence check makes this a no-op for the video.
 *
 * Best effort, never throws: this runs on failure paths where a throw would skip the error
 * handling that follows it. The steps are independent so one failing does not strand the others
 * (they already log what went wrong). Files another download uses are left alone, and a video
 * name that is not a plain file name is never touched: for item types other than Movie and
 * Episode it is the Jellyfin item id, which the server chooses.
 */
export function deletePendingDownloadFiles(record: PendingDownload): void {
  const usedElsewhere = namesUsedByOtherDownloads(record);

  if (
    isPlainFileName(record.videoFileName) &&
    !usedElsewhere.has(record.videoFileName)
  ) {
    try {
      deleteVideoFile(new File(Paths.document, record.videoFileName).uri);
    } catch {}
  }

  try {
    deleteAllAssociatedFiles({
      mediaSource: {
        ...record.mediaSource,
        MediaStreams: record.mediaSource?.MediaStreams?.filter((stream) => {
          const name = subtitleFileName(stream);
          return !name || !usedElsewhere.has(name);
        }),
      },
      trickPlayData:
        record.trickPlayData?.path &&
        usedElsewhere.has(trickplayDirName(record.trickPlayData.path) ?? "")
          ? undefined
          : record.trickPlayData,
    });
  } catch {}
}

/**
 * Get the size of a downloaded item by ID
 * Includes video file size and trickplay data size
 */
export function getDownloadedItemSize(id: string): number {
  const item = getDownloadedItemById(id);
  if (!item) return 0;

  const videoSize = item.videoFileSize || 0;
  const trickplaySize = item.trickPlayData?.size || 0;

  return videoSize + trickplaySize;
}

/**
 * Calculate total size of all downloaded items
 */
export function calculateTotalDownloadedSize(): number {
  const items = getAllDownloadedItems();
  return items.reduce((sum, item) => {
    // Trickplay bytes count too — getDownloadedItemSize models per-item size
    // as video + trickplay, the total must match.
    const trickplaySize = item.trickPlayData?.size ?? 0;
    // Read the live file size on disk so the total reflects actual usage and
    // self-heals items whose stored videoFileSize is 0 (old schema, or
    // `fileInfo.size` was undefined at download time). Fall back to the stored
    // value if the file can't be stat'd.
    if (item.videoFilePath) {
      try {
        const file = new File(filePathToUri(item.videoFilePath));
        if (file.exists) {
          return sum + (file.size ?? item.videoFileSize ?? 0) + trickplaySize;
        }
      } catch (error) {
        console.warn("Failed to stat downloaded file for size:", error);
      }
    }
    return sum + (item.videoFileSize ?? 0) + trickplaySize;
  }, 0);
}
