import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { File, Paths } from "expo-file-system";
import type { Bitrate } from "@/components/BitrateSelector";
import type {
  DownloadActivityMetadata,
  MultiTrackDownloadPlan,
} from "@/modules/background-downloader";
import BackgroundDownloader from "@/modules/background-downloader";
import {
  deleteSecureCustomHeaderValues,
  resolveCustomHeaderValues,
  secureCustomHeaderMetadata,
} from "@/utils/customHeaders/secureValues";
import type { CustomHeader } from "@/utils/customHeaders/types";
import { logAndCaptureError } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { addDownloadedItem } from "./database";
import type { DownloadedItem, MediaTimeSegment, TrickPlayData } from "./types";
import { uriToFilePath } from "./utils";

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
  /** Persisted stage; multi-track failures retain their completed inputs. */
  status: "queued" | "downloading" | "preparing" | "error";
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
  /** Extra inputs; paths are derived from videoFileName after a relaunch. */
  multiTrack?: Omit<MultiTrackDownloadPlan, "videoUrl" | "destinationPath">;
  /** Last failure, shown until retry or cancellation. */
  error?: string;
  /** Header names and SecureStore references; never plaintext credentials. */
  requiredHttpHeaders?: CustomHeader[];
}

const PENDING_DOWNLOADS_KEY = "downloads.pending.v1.json";

// readAll runs on every accessor call, so report corruption only once per
// session instead of flooding the log and Sentry.
let reportedCorruptStore = false;

function readAll(): Record<string, PendingDownload> {
  const raw = storage.getString(PENDING_DOWNLOADS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, PendingDownload>;
  } catch (error) {
    // Falling back to {} forgets every in-flight download, so make the
    // corruption visible instead of losing them silently.
    if (!reportedCorruptStore) {
      reportedCorruptStore = true;
      logAndCaptureError("Pending-downloads store is corrupt", error);
    }
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

export function savePendingDownload(
  record: PendingDownload,
  requiredHttpHeaders?: Record<string, string>,
): PendingDownload {
  const records = readAll();
  const stored = { ...record };
  if (requiredHttpHeaders && Object.keys(requiredHttpHeaders).length > 0) {
    stored.requiredHttpHeaders = secureCustomHeaderMetadata(
      `download:${record.itemId}`,
      Object.entries(requiredHttpHeaders).map(([key, value]) => ({
        key,
        value,
        enabled: true,
      })),
      records[record.itemId]?.requiredHttpHeaders,
    );
  }
  records[record.itemId] = stored;
  writeAll(records);
  return stored;
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
  deleteSecureCustomHeaderValues(records[itemId].requiredHttpHeaders ?? []);
  delete records[itemId];
  writeAll(records);
}

/** URI of the video file a pending download writes to (derived, never stored). */
export function pendingDownloadFileUri(record: PendingDownload): string {
  return new File(Paths.document, record.videoFileName).uri;
}

/** Reuses native completed inputs when enqueueing or retrying a bundle. */
export async function enqueuePendingDownload(
  record: PendingDownload,
  headers?: Record<string, string>,
): Promise<number> {
  const destinationPath = uriToFilePath(pendingDownloadFileUri(record));
  const required = resolveCustomHeaderValues(record.requiredHttpHeaders ?? []);
  if (
    required.length !== (record.requiredHttpHeaders?.length ?? 0) ||
    required.some((header) => !header.value)
  ) {
    throw new Error(
      "Required download credentials are unavailable; unlock the device and retry",
    );
  }
  const mergedHeaders = new Map(
    Object.entries(headers ?? {}).map(([name, value]) => [
      name.toLowerCase(),
      { name, value },
    ]),
  );
  for (const { key: name, value } of required) {
    const key = name.toLowerCase();
    const existing = mergedHeaders.get(key);
    if (existing && existing.value !== value) {
      throw new Error(
        "Required download headers conflict with the server proxy headers",
      );
    }
    mergedHeaders.set(key, { name, value });
  }
  const nativeHeaders =
    mergedHeaders.size > 0
      ? Object.fromEntries(
          [...mergedHeaders.values()].map(({ name, value }) => [name, value]),
        )
      : undefined;
  let taskId: number;
  if (record.multiTrack) {
    if (!record.activityMetadata) {
      throw new Error("Multi-track download is missing its native metadata");
    }
    taskId = await BackgroundDownloader.enqueueMultiTrackDownload(
      {
        ...record.multiTrack,
        videoUrl: record.inputUrl,
        destinationPath,
      },
      record.activityMetadata,
      nativeHeaders,
    );
  } else {
    taskId = await BackgroundDownloader.enqueueDownload(
      record.inputUrl,
      destinationPath,
      record.activityMetadata,
      nativeHeaders,
    );
  }
  updatePendingDownload(record.itemId, {
    status: taskId === -1 ? "queued" : "downloading",
    taskId,
    error: undefined,
  });
  return taskId;
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
  if (
    record.multiTrack &&
    (!Number.isFinite(videoFileSize) || videoFileSize <= 0)
  ) {
    throw new Error("Multi-track download did not produce a non-empty MKV");
  }
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
      ...(record.multiTrack && { isTranscoded: true, isMultiTrack: true }),
    },
  };

  addDownloadedItem(downloadedItem);
  removePendingDownload(record.itemId);

  return downloadedItem;
}
