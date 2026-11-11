import { OFFLINE_PROGRESS_PENDING_KEY } from "@/constants/Downloads";
import { storage } from "@/utils/mmkv";

/**
 * Downloads whose watch progress was saved on the device while the server
 * could not be reached, keyed by the user who watched them.
 *
 * Downloads carry no owner, so without the user the progress one account made
 * offline would be pushed into whichever account is signed in when the
 * connection returns. Persisted so it survives the app being closed offline.
 *
 * Each item keeps the LastPlayedDate its local progress was saved with. The
 * local progress is shared by every account on the device, so the sync only
 * pushes it while it is still the one this user saved (isQueuedSave), and an
 * entry is only cleared while it is still the one the sync read.
 */
export type OfflineProgress = Record<string, string>;
type PendingByUser = Record<string, OfflineProgress>;

const isStringRecord = (value: unknown): value is OfflineProgress =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.values(value).every((stamp) => typeof stamp === "string");

const read = (): PendingByUser => {
  const raw = storage.getString(OFFLINE_PROGRESS_PENDING_KEY);
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  // Anything else under a user is dropped rather than allowed to throw in the
  // playback save path.
  const pending: PendingByUser = {};
  for (const [userId, items] of Object.entries(parsed)) {
    if (isStringRecord(items)) pending[userId] = items;
  }
  return pending;
};

const write = (pending: PendingByUser) => {
  const users = Object.keys(pending).filter(
    (id) => Object.keys(pending[id]).length > 0,
  );
  if (users.length === 0) {
    storage.remove(OFFLINE_PROGRESS_PENDING_KEY);
    return;
  }
  storage.set(
    OFFLINE_PROGRESS_PENDING_KEY,
    JSON.stringify(Object.fromEntries(users.map((id) => [id, pending[id]]))),
  );
};

/** Queues [itemId] for [userId], saved locally with [lastPlayed]. */
export const markOfflineProgress = (
  userId: string,
  itemId: string,
  lastPlayed: string,
) => {
  const pending = read();
  pending[userId] = { ...pending[userId], [itemId]: lastPlayed };
  write(pending);
};

/**
 * Whether a download's record is still the save a user queued with [stamp]:
 * one saved again since, by another account on the device or by this one, is
 * not this user's to send, nor to write over.
 */
export const isQueuedSave = (
  recordLastPlayed: string | null | undefined,
  stamp: string,
) => recordLastPlayed === stamp;

export const getOfflineProgress = (userId: string): OfflineProgress =>
  read()[userId] ?? {};

/**
 * Removes the given entries, each only while it is unchanged: progress saved
 * again since it was read is kept for the next sync.
 */
export const clearOfflineProgress = (
  userId: string,
  entries: OfflineProgress,
) => {
  const pending = read();
  const items = { ...pending[userId] };
  for (const [itemId, stamp] of Object.entries(entries)) {
    if (items[itemId] === stamp) delete items[itemId];
  }
  pending[userId] = items;
  write(pending);
};
