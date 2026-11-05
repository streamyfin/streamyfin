import { OFFLINE_PROGRESS_PENDING_KEY } from "@/constants/Downloads";
import { storage } from "@/utils/mmkv";

/**
 * Downloads whose watch progress was saved on the device while the server
 * could not be reached, keyed by the user who watched them.
 *
 * Downloads carry no owner, so without the user the progress one account made
 * offline would be pushed into whichever account is signed in when the
 * connection returns. Persisted so it survives the app being closed offline.
 */
type PendingByUser = Record<string, string[]>;

const read = (): PendingByUser => {
  const raw = storage.getString(OFFLINE_PROGRESS_PENDING_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const write = (pending: PendingByUser) => {
  const users = Object.keys(pending).filter((id) => pending[id].length > 0);
  if (users.length === 0) {
    storage.remove(OFFLINE_PROGRESS_PENDING_KEY);
    return;
  }
  storage.set(
    OFFLINE_PROGRESS_PENDING_KEY,
    JSON.stringify(Object.fromEntries(users.map((id) => [id, pending[id]]))),
  );
};

export const markOfflineProgress = (userId: string, itemId: string) => {
  const pending = read();
  const items = pending[userId] ?? [];
  if (items.includes(itemId)) return;
  pending[userId] = [...items, itemId];
  write(pending);
};

export const getOfflineProgress = (userId: string): string[] =>
  read()[userId] ?? [];

export const clearOfflineProgress = (userId: string, itemIds: string[]) => {
  const pending = read();
  const remaining = (pending[userId] ?? []).filter(
    (id) => !itemIds.includes(id),
  );
  pending[userId] = remaining;
  write(pending);
};
