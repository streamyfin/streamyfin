import { mock } from "bun:test";
import { atom } from "jotai";

/**
 * `@/utils/log` pulls in Sentry, which needs React Native's AppRegistry, so a
 * spec that only needs the import to resolve stubs it. The shape is the whole
 * module: `mock.module` is global, and a double missing one export fails
 * whichever spec imports that export after it.
 */
export const stubLog = () =>
  mock.module("@/utils/log", () => ({
    writeToLog: () => undefined,
    logAndCaptureError: () => undefined,
    writeInfoLog: () => undefined,
    writeErrorLog: () => undefined,
    writeDebugLog: () => undefined,
    readFromLog: () => [],
    useLog: () => ({ logs: [], clearLogs: () => undefined }),
    LogProvider: ({ children }: { children: unknown }) => children,
    default: atom([]),
  }));
