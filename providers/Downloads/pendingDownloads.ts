import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { File, Paths } from "expo-file-system";
import type { Bitrate } from "@/components/BitrateSelector";
import type { DownloadActivityMetadata } from "@/modules/background-downloader";
import { storage } from "@/utils/mmkv";
import { addDownloadedItem } from "./database";
import type { DownloadedItem, MediaTimeSegment, TrickPlayData } from "./types";

/**
 * Persisted record of an in-flight download, written at enqueue time and removed on completion.
 *
 * This is what lets a download survive the death of the JS runtime. The native layer keeps
 * transferring after the app is killed and moves the file into place on relaunch, but the
 * downloads database entry used to be assembled from in-memory React state — so a download that
 * finished while JS was dead produced a file on disk the app never learned about. Everything the
 * final `DownloadedItem` needs is known at enqueue time except the file size, which is read from
 * the file itself; persisting it here makes completion bookkeeping possible at any later point,
 * including a cold start (see `useDownloadReconciliation`).
 */
export interface PendingDownload {
  /** Jellyfin item id; the record key, and how native events are correlated back. */
  itemId: string;
  /** `queued` until the native started event fires, then `downloading`. */
  status: "queued" | "downloading";
  enqueuedAt: string;
  /** Native task id, known once the download actually starts. */
  taskId?: number;
  inputUrl: string;
  /**
   * File name inside the app Documents directory. Deliberately never an absolute path — the iOS
   * container path changes between app updates, so absolute paths go stale.
   */
  videoFileName: string;
  item: BaseItemDto;
  mediaSource: MediaSourceInfo;
  maxBitrate: Bitrate;
  deviceId: string;
  trickPlayData?: TrickPlayData;
  introSegments?: MediaTimeSegment[];
  creditSegments?: MediaTimeSegment[];
  recapSegments?: MediaTimeSegment[];
  commercialSegments?: MediaTimeSegment[];
  previewSegments?: MediaTimeSegment[];
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  /** Metadata originally handed to native; reused when re-enqueueing after a relaunch. */
  activityMetadata?: DownloadActivityMetadata;
}

const PENDING_DOWNLOADS_KEY = "downloads.pending.v1.json";

function readAll(): Record<string, PendingDownload> {
  const raw = storage.getString(PENDING_DOWNLOADS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, PendingDownload>;
  } catch {
    return {};
  }
}

function writeAll(records: Record<string, PendingDownload>): void {
  storage.set(PENDING_DOWNLOADS_KEY, JSON.stringify(records));
}

export function getPendingDownloads(): PendingDownload[] {
  return Object.values(readAll());
}

export function getPendingDownload(
  itemId: string,
): PendingDownload | undefined {
  return readAll()[itemId];
}

export function savePendingDownload(record: PendingDownload): void {
  const records = readAll();
  records[record.itemId] = record;
  writeAll(records);
}

export function updatePendingDownload(
  itemId: string,
  patch: Partial<PendingDownload>,
): void {
  const records = readAll();
  const existing = records[itemId];
  if (!existing) return;
  records[itemId] = { ...existing, ...patch };
  writeAll(records);
}

export function removePendingDownload(itemId: string): void {
  const records = readAll();
  if (!(itemId in records)) return;
  delete records[itemId];
  writeAll(records);
}

/** URI of the video file a pending download writes to (derived, never stored). */
export function pendingDownloadFileUri(record: PendingDownload): string {
  return new File(Paths.document, record.videoFileName).uri;
}

/**
 * Turns a pending record into a permanent downloads-database entry and removes the record.
 *
 * `isTranscoded` can be passed when the live progress events already told us (no Content-Length);
 * after a relaunch that signal is gone and the presence of a TranscodingUrl is the fallback.
 */
export function finalizePendingDownload(
  record: PendingDownload,
  videoFileSize: number,
  isTranscoded?: boolean,
): DownloadedItem {
  const downloadedItem: DownloadedItem = {
    item: record.item,
    mediaSource: record.mediaSource,
    videoFilePath: pendingDownloadFileUri(record),
    videoFileSize,
    videoFileName: record.videoFileName,
    trickPlayData: record.trickPlayData,
    introSegments: record.introSegments,
    creditSegments: record.creditSegments,
    recapSegments: record.recapSegments,
    commercialSegments: record.commercialSegments,
    previewSegments: record.previewSegments,
    userData: {
      audioStreamIndex: record.audioStreamIndex ?? 0,
      subtitleStreamIndex: record.subtitleStreamIndex ?? -1,
      isTranscoded: isTranscoded ?? !!record.mediaSource.TranscodingUrl,
    },
  };

  addDownloadedItem(downloadedItem);
  removePendingDownload(record.itemId);

  return downloadedItem;
}
