// Database operations

// Additional downloads (trickplay, subtitles, cover images)
export {
  downloadAdditionalAssets,
  downloadCoverImage,
  downloadSeriesImage,
  downloadSubtitles,
  downloadTrickplayImages,
  fetchSegments,
} from "./additionalDownloads";
export {
  addDownloadedItem,
  clearAllDownloadedItems,
  getAllDownloadedItems,
  getDownloadedItemById,
  getDownloadsDatabase,
  removeDownloadedItem,
  saveDownloadsDatabase,
} from "./database";
// File operations
export {
  calculateTotalDownloadedSize,
  deleteAllAssociatedFiles,
  deleteVideoFile,
  getDownloadedItemSize,
} from "./fileOperations";
// Hooks
export { useDownloadEventHandlers } from "./hooks/useDownloadEventHandlers";
export { useDownloadOperations } from "./hooks/useDownloadOperations";
export { useDownloadReconciliation } from "./hooks/useDownloadReconciliation";
// Notification helpers
export {
  getNotificationContent,
  sendDownloadNotification,
} from "./notifications";
// Pending download records (persisted while a download is in flight)
export {
  finalizePendingDownload,
  getPendingDownload,
  getPendingDownloads,
  type PendingDownload,
  removePendingDownload,
  savePendingDownload,
  updatePendingDownload,
} from "./pendingDownloads";
// Types (re-export from existing types.ts)
export type {
  DownloadedItem,
  DownloadedSeason,
  DownloadedSeries,
  DownloadsDatabase,
  JobStatus,
  MediaTimeSegment,
  TrickPlayData,
} from "./types";
// Utility functions
export { generateFilename, uriToFilePath } from "./utils";
