import { LOGS_STORAGE_KEY, MAX_LOG_ENTRIES } from "@/constants/Logs";
import { storage } from "./mmkv";
import { redactCredentials } from "./redactCredentials";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
}

// Stored in place of a value that neither JSON nor String() can render.
const UNRENDERABLE_VALUE = "[unrenderable]";

const redactStrings = (_key: string, value: unknown) =>
  typeof value === "string" ? redactCredentials(value) : value;

// Settings → Logs shows, copies and exports this log, and users attach the
// export to public issues, so credentials are redacted before anything is
// stored: native player lines carry the access token inside Jellyfin URLs
// (external subtitle titles). Values go through JSON, which is the form
// storage keeps anyway, so the caller's object is never touched.
const redactForLog = (value: unknown): unknown => {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? undefined : JSON.parse(json, redactStrings);
  } catch {
    // Circular refs or a BigInt: keep what String() makes of it, unless even
    // that throws (a null prototype, a throwing toString).
    try {
      return redactCredentials(String(value));
    } catch {
      return UNRENDERABLE_VALUE;
    }
  }
};

export const storeLogEntry = (
  level: LogLevel,
  message: string,
  data?: unknown,
): void => {
  const newEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: level,
    // Typed as a string, but catch blocks pass whatever they caught.
    message: redactForLog(message) as string,
    data: redactForLog(data),
  };

  // The logging path itself must never throw: a corrupt persisted blob, or
  // one that isn't a list, falls back to an empty log instead of taking down
  // the caller, which is often itself a catch block.
  let logs: LogEntry[];
  try {
    const currentLogs = storage.getString(LOGS_STORAGE_KEY);
    const parsed = currentLogs ? JSON.parse(currentLogs) : [];
    logs = Array.isArray(parsed) ? parsed : [];
  } catch {
    logs = [];
  }
  logs.push(newEntry);

  const recentLogs = logs.slice(Math.max(logs.length - MAX_LOG_ENTRIES, 0));

  try {
    storage.set(LOGS_STORAGE_KEY, JSON.stringify(recentLogs));
  } catch {
    // Drop the write rather than throw.
  }
};

export const readFromLog = (): LogEntry[] => {
  const logs = storage.getString(LOGS_STORAGE_KEY);
  return logs ? JSON.parse(logs) : [];
};

/**
 * Redacts a log stored before redaction existed, for the storage migration.
 * Returns undefined when the blob isn't a readable log: nothing in it is worth
 * keeping, and a partial blob can still hold a token.
 */
export const redactStoredLog = (stored: string): string | undefined => {
  try {
    const logs = JSON.parse(stored, redactStrings);
    return Array.isArray(logs) ? JSON.stringify(logs) : undefined;
  } catch {
    return undefined;
  }
};
