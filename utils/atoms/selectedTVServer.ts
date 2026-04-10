import { atom } from "jotai";
import { storage } from "../mmkv";

const STORAGE_KEY = "selectedTVServer";

export interface SelectedTVServerState {
  address: string;
  name?: string;
}

/**
 * Load the selected TV server from MMKV storage.
 */
function loadSelectedTVServer(): SelectedTVServerState | null {
  const stored = storage.getString(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as SelectedTVServerState;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Save the selected TV server to MMKV storage.
 */
function saveSelectedTVServer(server: SelectedTVServerState | null): void {
  if (server) {
    storage.set(STORAGE_KEY, JSON.stringify(server));
  } else {
    storage.remove(STORAGE_KEY);
  }
}

/**
 * Base atom holding the selected TV server state.
 */
const baseSelectedTVServerAtom = atom<SelectedTVServerState | null>(
  loadSelectedTVServer(),
);

/**
 * Derived atom that persists changes to MMKV storage.
 */
export const selectedTVServerAtom = atom(
  (get) => get(baseSelectedTVServerAtom),
  (_get, set, newValue: SelectedTVServerState | null) => {
    saveSelectedTVServer(newValue);
    set(baseSelectedTVServerAtom, newValue);
  },
);

/**
 * Clear the selected TV server (used when changing servers).
 */
export function clearSelectedTVServer(): void {
  storage.remove(STORAGE_KEY);
}
