import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { storage } from "./mmkv";

type LogLevel = "INFO" | "WARN" | "ERROR";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
}

const mmkvStorage = createJSONStorage(() => ({
  getItem: (key: string) => storage.getString(key) || null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
}));
const logsAtom = atomWithStorage("logs", [], mmkvStorage);

export const writeToLog = (level: LogLevel, message: string, data?: any) => {
  const newEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: level,
    message: message,
    data: data,
  };

  const currentLogs = storage.getString("logs");
  const logs: LogEntry[] = currentLogs ? JSON.parse(currentLogs) : [];
  logs.push(newEntry);

  const maxLogs = 100;
  const recentLogs = logs.slice(Math.max(logs.length - maxLogs, 0));

  storage.set("logs", JSON.stringify(recentLogs));
};

export const readFromLog = (): LogEntry[] => {
  const logs = storage.getString("logs");
  return logs ? JSON.parse(logs) : [];
};

export const clearLogs = () => {
  storage.delete("logs");
};

export default logsAtom;
