import type { Api } from "@jellyfin/sdk";
import {
  cancelDownload,
  deleteTrack,
  downloadTrack,
  isPermanentDownloading,
  isPermanentlyDownloaded,
} from "@/providers/AudioStorage";
import { type Audiobook, partDurations } from "@/utils/audiobooks/books";
import { audiobookFileExtension } from "@/utils/audiobooks/fileExtension";
import {
  registerDownloadedBook,
  unregisterDownloadedBook,
} from "@/utils/audiobooks/storage";
import { getJellyfinHeadersForUrl } from "@/utils/customHeaders";
import { getAudioStreamUrl } from "@/utils/jellyfin/audio/getAudioStreamUrl";

/**
 * Book downloads, kept in the audio storage music downloads use: one file per
 * part, stored by the part's item id, so the player finds a downloaded part
 * the way it finds a downloaded song. The book itself is written to the
 * downloads list, which is what the app lists and plays without a server.
 */

export type BookDownloadStatus = "none" | "downloading" | "partial" | "done";

export const bookDownloadStatus = (book: Audiobook): BookDownloadStatus => {
  const ids = book.parts.map((part) => part.Id);
  const downloaded = ids.filter((id) => isPermanentlyDownloaded(id)).length;
  if (ids.length > 0 && downloaded === ids.length) return "done";
  if (ids.some((id) => isPermanentDownloading(id))) return "downloading";
  return downloaded > 0 ? "partial" : "none";
};

/**
 * How much of the book is on the device, 0 to 1, each part weighed by its
 * length. `partProgress` holds the share of the parts still downloading.
 */
export const bookDownloadProgress = (
  book: Audiobook,
  partProgress: Record<string, number>,
): number => {
  const durations = partDurations(book);
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  if (book.parts.length === 0) return 0;
  let done = 0;
  book.parts.forEach((part, index) => {
    // Parts without a run time count as equal shares.
    const weight = total > 0 ? durations[index] / total : 1 / book.parts.length;
    const share = isPermanentlyDownloaded(part.Id)
      ? 1
      : Math.min(Math.max(partProgress[part.Id ?? ""] ?? 0, 0), 1);
    done += weight * share;
  });
  return Math.min(done, 1);
};

export interface BookDownloadResult {
  /** Parts handed to the downloader. */
  started: number;
  /** Parts the server would only transcode: a live transcode is no file. */
  unavailable: number;
}

export const downloadBook = async (
  api: Api,
  userId: string,
  book: Audiobook,
): Promise<BookDownloadResult> => {
  registerDownloadedBook(book);
  let started = 0;
  let unavailable = 0;
  for (const part of book.parts) {
    if (!part.Id) continue;
    if (isPermanentlyDownloaded(part.Id) || isPermanentDownloading(part.Id)) {
      continue;
    }
    const stream = await getAudioStreamUrl(api, userId, part.Id);
    if (!stream?.url || stream.isTranscoding) {
      unavailable += 1;
      continue;
    }
    await downloadTrack(part.Id, stream.url, {
      permanent: true,
      container: audiobookFileExtension(stream.mediaSource?.Container),
      headers: getJellyfinHeadersForUrl(stream.url, api.basePath),
    });
    started += 1;
  }
  return { started, unavailable };
};

export const cancelBookDownload = (book: Audiobook) => {
  for (const part of book.parts) {
    if (part.Id && isPermanentDownloading(part.Id)) cancelDownload(part.Id);
  }
};

export const deleteBookDownload = async (book: Audiobook) => {
  cancelBookDownload(book);
  for (const part of book.parts) {
    if (part.Id && isPermanentlyDownloaded(part.Id)) await deleteTrack(part.Id);
  }
  unregisterDownloadedBook(book.id);
};
