/** MMKV key of the app log that Settings → Logs shows, copies and exports. */
export const LOGS_STORAGE_KEY = "logs";

// The native player mirrors its log in here too (useNativePlayerLogBridge),
// so one playback can add a couple of dozen lines; 100 was pushing the
// startup/audio-route entries out before a user got to Settings → Logs.
export const MAX_LOG_ENTRIES = 250;
