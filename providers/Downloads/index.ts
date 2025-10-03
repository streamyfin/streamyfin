// Database operations
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
  deleteVideoFile,
  getDownloadedItemSize,
} from "./fileOperations";
// Hooks
export { useDownloadEventHandlers } from "./hooks/useDownloadEventHandlers";
export { useDownloadOperations } from "./hooks/useDownloadOperations";
// Notification helpers
export {
  getNotificationContent,
  sendDownloadNotification,
} from "./notifications";
// Types (re-export from existing types.ts)
export type {
  DownloadedItem,
  DownloadedSeason,
  DownloadedSeries,
  DownloadsDatabase,
  JobStatus,
  MediaTimeSegment,
  TrickPlayData,
  UserData,
} from "./types";
// Utility functions
export { generateFilename, uriToFilePath } from "./utils";
