import * as Sentry from "@sentry/react-native";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import type React from "react";
import { createContext, useContext } from "react";
import {
  describeHttpError,
  isAbortLikeError,
  isConnectivityError,
  isExpectedError,
  markErrorReported,
} from "./errors";
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

  const newEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: level,
    message: message,
    data: data,
  };

  // The logging path itself must never throw: a corrupt persisted blob or a
  // non-serializable `data` payload (circular refs) falls back instead of
  // taking down the caller — which is often itself a catch block.
  let logs: LogEntry[];
  try {
    const currentLogs = storage.getString("logs");
    logs = currentLogs ? JSON.parse(currentLogs) : [];
  } catch {
    logs = [];
  }
  logs.push(newEntry);

  // The native player mirrors its log in here too (useNativePlayerLogBridge),
  // so one playback can add a couple of dozen lines; 100 was pushing the
  // startup/audio-route entries out before a user got to Settings → Logs.
  const maxLogs = 250;
  const recentLogs = logs.slice(Math.max(logs.length - maxLogs, 0));

  try {
    storage.set("logs", JSON.stringify(recentLogs));
  } catch {
    newEntry.data = String(data);
    try {
      storage.set("logs", JSON.stringify(recentLogs));
    } catch {
      // Even the fallback failed — drop the write rather than throw.
    }
  }
};

// Sentry capture is always explicit (logAndCaptureError), never a side
// effect of log level: writeErrorLog has dozens of legacy call sites that
// include routine environmental noise (permission denials, servers without
// the plugin), and a level-triggered capture would silently opt in every
// present and future one of them.
export const writeToLog = (level: LogLevel, message: string, data?: any) => {
  appendLogEntry(level, message, data);
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

// The local log is exportable (Settings → Logs shares it as logs.txt), so a
// caught error is reduced to a curated shape before it is persisted: a raw
// AxiosError serializes its request config INCLUDING the Authorization and
// X-Api-Key headers, and a plain Error stringifies to "{}" (message/stack
// are non-enumerable) — both wrong, in opposite directions.
const describeErrorForLog = (error: unknown): unknown => {
  if (isAxiosError(error)) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.response?.status,
      url: error.config?.url?.split("?")[0],
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 8).join("\n"),
    };
  }
  return error;
};

// One Sentry event per (call site, endpoint, status) per session. A failing
// endpoint is hit again by every keystroke in search and by every screen that
// mounts the same request, and the Nth repeat says nothing the first didn't.
const reportedHttpErrors = new Set<string>();
const MAX_REPORTED_HTTP_ERRORS = 200;

/**
 * Records a failure both in the local log and as a Sentry exception — the
 * ONLY path that turns handled errors into Sentry events. Prefer it over
 * writeErrorLog when the caught error object is available.
 *
 * Connectivity failures (aborted requests, no HTTP response, gateway errors)
 * stay in the local log but are never sent: an unreachable server is the
 * user's environment, not an app bug.
 *
 * `context` is SENT to Sentry (after URL scrubbing), so pass only curated
 * values (codecs, status codes, item IDs) — never raw payloads or settings
 * blobs.
 */
export const logAndCaptureError = (
  message: string,
  error: unknown,
  context?: Record<string, unknown>,
) => {
  appendLogEntry("ERROR", message, describeErrorForLog(error));
  // Expected errors (markExpectedError) are user-facing outcomes — a wrong
  // URL, a server that can't satisfy the device profile — logged locally
  // like everything else, but never a Sentry event.
  if (
    isExpectedError(error) ||
    isAbortLikeError(error) ||
    isConnectivityError(error)
  ) {
    return;
  }
  // If this error is later rethrown into React Query, the global handler in
  // app/_layout.tsx must not report it again.
  markErrorReported(error);
  const http = describeHttpError(error);
  if (http) {
    const key = [message, http.method, http.path, http.status].join("|");
    if (reportedHttpErrors.has(key)) {
      return;
    }
    if (reportedHttpErrors.size < MAX_REPORTED_HTTP_ERRORS) {
      reportedHttpErrors.add(key);
    }
  }
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext("details", context);
    }
    if (http) {
      // An AxiosError's stack has no app frames (it is built inside axios),
      // so left to Sentry every HTTP failure in the app lands in ONE issue.
      // Group by what actually separates them: which call failed, to which
      // route, with which status.
      scope.setContext("http", http);
      scope.setFingerprint([
        message,
        http.method,
        http.path,
        String(http.status),
      ]);
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
