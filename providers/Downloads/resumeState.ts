import { storage } from "@/utils/mmkv";
import type { JobStatus } from "./types";

const RESUME_STATE_KEY = "downloads.resumeState.v1";

/**
 * Represents the state needed to resume a download after app closure.
 */
export interface DownloadResumeState {
  /** The process/item ID */
  processId: string;
  /** The download URL */
  url: string;
  /** The destination file path */
  destinationPath: string;
  /** Number of bytes downloaded so far */
  bytesDownloaded: number;
  /** The full JobStatus snapshot for restoring UI state */
  jobStatus: JobStatus;
  /** ISO timestamp of when the download was paused/interrupted */
  pausedAt: string;
}

function getAllResumeStatesMap(): Record<string, DownloadResumeState> {
  const raw = storage.getString(RESUME_STATE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as Record<string, DownloadResumeState>;
    } catch {
      return {};
    }
  }
  return {};
}

function saveAllResumeStates(
  states: Record<string, DownloadResumeState>,
): void {
  storage.set(RESUME_STATE_KEY, JSON.stringify(states));
}

/**
 * Save a download's resume state to persistent storage.
 */
export function saveResumeState(state: DownloadResumeState): void {
  const states = getAllResumeStatesMap();
  states[state.processId] = state;
  saveAllResumeStates(states);
}

/**
 * Get a specific download's resume state.
 */
export function getResumeState(
  processId: string,
): DownloadResumeState | undefined {
  const states = getAllResumeStatesMap();
  return states[processId];
}

/**
 * Get all saved resume states (for startup recovery).
 */
export function getAllResumeStates(): DownloadResumeState[] {
  const states = getAllResumeStatesMap();
  return Object.values(states);
}

/**
 * Remove a download's resume state (after successful resume or cancellation).
 */
export function removeResumeState(processId: string): void {
  const states = getAllResumeStatesMap();
  delete states[processId];
  saveAllResumeStates(states);
}

/**
 * Clear all resume states.
 */
export function clearAllResumeStates(): void {
  storage.remove(RESUME_STATE_KEY);
}
