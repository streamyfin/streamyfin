/**
 * Audio Storage Types
 *
 * Shared foundation supporting both:
 * - Look-ahead cache (auto-managed, ephemeral)
 * - Future full music downloads (user-initiated, permanent)
 */

export interface StoredTrackInfo {
  itemId: string;
  localPath: string;
  size: number;
  storedAt: number;
  permanent: boolean; // true = user download, false = cache
}

export interface AudioStorageIndex {
  tracks: Record<string, StoredTrackInfo>;
  totalCacheSize: number;
  totalPermanentSize: number;
}

export interface DownloadOptions {
  permanent: boolean;
}

export interface DownloadCompleteEvent {
  itemId: string;
  localPath: string;
  permanent: boolean;
}

export interface DownloadErrorEvent {
  itemId: string;
  error: string;
}

export interface DownloadProgressEvent {
  itemId: string;
  progress: number; // 0-1
}
