import * as Sentry from "@sentry/react-native";
import { useQuery } from "@tanstack/react-query";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import type React from "react";
import { createContext, useContext } from "react";
import { markErrorReported } from "./errors";
import { storage } from "./mmkv";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

const SENTRY_BREADCRUMB_LEVELS: Record<LogLevel, Sentry.SeverityLevel> = {
  INFO: "info",
  WARN: "warning",
  ERROR: "error",
  DEBUG: "debug",
};

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
}

const mmkvStorage = createJSONStorage(() => ({
  getItem: (key: string) => storage.getString(key) || null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.remove(key),
}));
const logsAtom = atomWithStorage("logs", [], mmkvStorage);

const LogContext = createContext<ReturnType<typeof useLogProvider> | null>(
  null,
);
const _DownloadContext = createContext<ReturnType<
  typeof useLogProvider
> | null>(null);

function useLogProvider() {
  const { data: logs } = useQuery({
    queryKey: ["logs"],
    queryFn: async () => readFromLog(),
    refetchInterval: 1000,
  });

  return {
    logs,
  };
}

// Mirror app logs into Sentry as breadcrumbs so crash reports carry the log
// trail leading up to them. `data` stays local: it can hold raw URLs and
// payloads the URL scrubber wouldn't reach (hosts without a scheme, tokens).
const appendLogEntry = (level: LogLevel, message: string, data?: any) => {
  Sentry.addBreadcrumb({
    category: "app.log",
    level: SENTRY_BREADCRUMB_LEVELS[level],
    message,
  });

  // `data` is often a caught error now — guard against non-serializable
  // payloads (circular refs) so the logging path itself can never throw.
  let safeData = data;
  if (data !== undefined) {
    try {
      JSON.stringify(data);
    } catch {
      safeData = String(data);
    }
  }

  const newEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: level,
    message: message,
    data: safeData,
  };

  const currentLogs = storage.getString("logs");
  const logs: LogEntry[] = currentLogs ? JSON.parse(currentLogs) : [];
  logs.push(newEntry);

  const maxLogs = 100;
  const recentLogs = logs.slice(Math.max(logs.length - maxLogs, 0));

  storage.set("logs", JSON.stringify(recentLogs));
};

export const writeToLog = (level: LogLevel, message: string, data?: any) => {
  appendLogEntry(level, message, data);
  // ERROR-level logs become real Sentry events (not just breadcrumbs): the
  // message alone is sent, so grouping stays stable and `data` stays local.
  if (level === "ERROR") {
    Sentry.captureMessage(message, "error");
  }
};

const stringifyErrorValue = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return undefined;
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return String(value);
  }
};

/**
 * Records a failure both in the local log and as a Sentry exception. Prefer
 * this over writeErrorLog when the caught error object is available — a real
 * stack trace groups and debugs far better than a message string.
 *
 * `context` is SENT to Sentry (after URL scrubbing), so pass only curated
 * values (codecs, status codes, item IDs) — never raw payloads or settings
 * blobs. The `error` value doubles as the local log's `data`.
 */
export const logAndCaptureError = (
  message: string,
  error: unknown,
  context?: Record<string, unknown>,
) => {
  appendLogEntry("ERROR", message, error);
  // If this error is later rethrown into React Query, the global handler in
  // app/_layout.tsx must not report it again.
  markErrorReported(error);
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext("details", context);
    }
    if (error instanceof Error) {
      scope.setExtra("log_message", message);
      Sentry.captureException(error);
    } else {
      // Non-Error values (native event strings, rejected payloads) get
      // wrapped in a synthetic Error whose stack points here, so group by
      // log message + detail instead: one issue per distinct failure, not
      // one blob per call site. (Fingerprints are scrubbed like the rest of
      // the event, so URLs in the detail don't fragment grouping.)
      const detail = stringifyErrorValue(error);
      scope.setFingerprint(detail ? [message, detail] : [message]);
      Sentry.captureException(
        new Error(detail ? `${message}: ${detail}` : message),
      );
    }
  });
};

export const writeInfoLog = (message: string, data?: any) =>
  writeToLog("INFO", message, data);
export const writeErrorLog = (message: string, data?: any) =>
  writeToLog("ERROR", message, data);
export const writeDebugLog = (message: string, data?: any) => {
  if (process.env.EXPO_PUBLIC_WRITE_DEBUG === "1") {
    writeToLog("DEBUG", message, data);
  }
};

export const readFromLog = (): LogEntry[] => {
  const logs = storage.getString("logs");
  return logs ? JSON.parse(logs) : [];
};

export function useLog() {
  const context = useContext(LogContext);
  if (context === null) {
    throw new Error("useLog must be used within a LogProvider");
  }
  return context;
}

export function LogProvider({ children }: { children: React.ReactNode }) {
  const provider = useLogProvider();

  return <LogContext.Provider value={provider}>{children}</LogContext.Provider>;
}

export default logsAtom;
