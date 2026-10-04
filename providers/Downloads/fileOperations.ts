import { Directory, File, Paths } from "expo-file-system";
import { DOWNLOAD_PART_FILE_SUFFIX } from "@/constants/Downloads";
import { getAllDownloadedItems, getDownloadedItemById } from "./database";
import { getPendingDownloads, type PendingDownload } from "./pendingDownloads";
import type { DownloadedItem } from "./types";
import {
  filePathToUri,
  isPlainFileName,
  subtitleFileName,
  trickplayDirName,
} from "./utils";

/** What owns files in Documents: a finished download, or the record of one in flight. */
type FileOwner = Pick<DownloadedItem, "item" | "mediaSource"> & {
  videoFileName?: string;
  videoFilePath?: string;
};

type OwnedNames = { video?: string; subtitles: string[]; trickplay: string };

/**
 * Names in Documents of everything `owner` wrote, or was about to write.
 *
 * The subtitle and trickplay names come from the item, through the builders the writer uses,
 * never from a stored DeliveryUrl: a subtitle whose download failed still carries the server's
 * URL, while on Android its partial file sits at the name the writer picked. The builders only
 * give plain file names. The video name is read back as it was stored, so it is checked here.
 */
function ownedNames(owner: FileOwner): OwnedNames {
  // A download saved before videoFileName existed only carries the path.
  const video = owner.videoFileName ?? owner.videoFilePath?.split("/").pop();
  return {
    video: isPlainFileName(video) ? video : undefined,
    subtitles: (owner.mediaSource?.MediaStreams ?? [])
      .filter(
        (stream) =>
          stream?.Type === "Subtitle" && stream.DeliveryMethod === "External",
      )
      .map((stream) => subtitleFileName(owner.item, stream)),
    trickplay: trickplayDirName(owner.item),
  };
}

/**
 * Names in use by every download other than the one being cleaned up, which is left out by its
 * item id: `pending` when it is a pending record, `finished` when it is a finished download.
 * generateFilename maps different items to the same name (movies of one title and year, episodes
 * of series that normalise alike), so two downloads can share files.
 */
function namesUsedByOthers(self: {
  pending?: string;
  finished?: string | null;
}): Set<string> {
  const used = new Set<string>();
  const add = (owner: FileOwner) => {
    const { video, subtitles, trickplay } = ownedNames(owner);
    for (const name of [video, ...subtitles, trickplay]) {
      if (name) used.add(name);
    }
  };
  for (const download of getAllDownloadedItems()) {
    if (self.finished && download.item.Id === self.finished) continue;
    add(download);
  }
  for (const pending of getPendingDownloads()) {
    if (pending.itemId !== self.pending) add(pending);
  }
  return used;
}

/** Removes one entry from Documents. A failure is logged and does not stop the rest. */
function removeFromDocuments(
  Entry: typeof File | typeof Directory,
  name: string,
  label: string,
): void {
  try {
    const entry = new Entry(Paths.document, name);
    if (entry.exists) {
      entry.delete();
      console.log(`[DELETE] ${label} deleted: ${name}`);
    }
  } catch (error) {
    console.error(`[DELETE] Failed to delete ${label}:`, error);
  }
}

function deleteSidecars(
  { subtitles, trickplay }: OwnedNames,
  usedElsewhere: Set<string>,
): void {
  for (const name of subtitles) {
    if (!usedElsewhere.has(name)) removeFromDocuments(File, name, "Subtitle");
  }
  if (!usedElsewhere.has(trickplay)) {
    removeFromDocuments(Directory, trickplay, "Trickplay directory");
  }
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
 *
 * Files another download uses are left alone. The item itself may still be in the database, so
 * it is left out of that check by its id.
 */
export function deleteAllAssociatedFiles(item: DownloadedItem): void {
  try {
    const names = ownedNames(item);
    const usedElsewhere = namesUsedByOthers({ finished: item.item.Id });

    if (
      item.videoFilePath &&
      !(names.video && usedElsewhere.has(names.video))
    ) {
      deleteVideoFile(item.videoFilePath);
    }
    deleteSidecars(names, usedElsewhere);
  } catch (error) {
    console.error("[DELETE] Error deleting associated files:", error);
    throw error;
  }
}

/**
 * A pending record, or as much of one as exists: a start that fails before the record is saved
 * has no video file name yet.
 */
type AbandonedDownload = Pick<
  PendingDownload,
  "itemId" | "item" | "mediaSource"
> & { videoFileName?: string };

/**
 * Delete what an abandoned download left on disk.
 *
 * Subtitles and trickplay sheets are written before the video is handed to native, so a download
 * that is cancelled or fails has already put them in Documents. The video itself is staged
 * elsewhere until it is complete: iOS keeps it in a system temp file, Android in
 * `<name>.part`, which native removes on cancel and on error but cannot remove when the process
 * is killed mid-transfer.
 *
 * Best effort, never throws: this runs on failure paths where a throw would skip the error
 * handling that follows it. Files another download uses are left alone.
 */
export function deletePendingDownloadFiles(download: AbandonedDownload): void {
  try {
    const names = ownedNames(download);
    const usedElsewhere = namesUsedByOthers({ pending: download.itemId });

    if (names.video && !usedElsewhere.has(names.video)) {
      removeFromDocuments(File, names.video, "Video file");
      removeFromDocuments(
        File,
        `${names.video}${DOWNLOAD_PART_FILE_SUFFIX}`,
        "Partial video file",
      );
    }
    deleteSidecars(names, usedElsewhere);
  } catch (error) {
    console.error("[DELETE] Failed to clean up an abandoned download:", error);
  }
}

/**
 * Delete a video that native reported complete and that no download accounts for.
 *
 * That is a download cancelled while its last bytes came in: the native cancel is asynchronous,
 * so the transfer can still finish and land in Documents after the cancel dropped the record
 * and cleaned up.
 *
 * A name in use is left alone, and that is what tells a cancelled download from a finished one:
 * a download finalized before its completion event arrived owns the file, and so does a new
 * download of the same item. Never throws, it runs in an event handler.
 */
export function deleteUnclaimedVideo(filePath: string): void {
  try {
    const name = filePath.split("/").pop();
    if (!isPlainFileName(name) || namesUsedByOthers({}).has(name)) return;
    removeFromDocuments(File, name, "Unclaimed video file");
  } catch (error) {
    console.error("[DELETE] Failed to remove an unclaimed video:", error);
  }
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
