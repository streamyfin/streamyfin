import {
  AUDIOBOOK_BOOKMARKS_KEY,
  AUDIOBOOK_DOWNLOADS_KEY,
  AUDIOBOOK_PROGRESS_KEY,
  AUDIOBOOK_SESSION_KEY,
} from "@/constants/Audiobooks";
import { type Audiobook, slimBook } from "@/utils/audiobooks/books";
import type { LocalBookProgress } from "@/utils/audiobooks/progress";
import { storage } from "@/utils/mmkv";

/**
 * What the audiobook player keeps on the device. Progress, the session and
 * bookmarks belong to one account (`serverId:userId`): two users of one
 * server each have their own place in a book. Downloaded files are shared by
 * the server's accounts, as downloaded music is.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const readJson = (key: string): Record<string, unknown> => {
  try {
    const raw = storage.getString(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeJson = (key: string, value: unknown) => {
  try {
    storage.set(key, JSON.stringify(value));
  } catch {
    // A full or failing store loses this write; the next one tries again.
  }
};

/** The account a record belongs to, null when signed out. */
export const accountKeyFor = (
  user?: { Id?: string | null; ServerId?: string | null } | null,
): string | null => (user?.Id ? `${user.ServerId ?? ""}:${user.Id}` : null);

// ---------------------------------------------------------------- progress

const isProgress = (value: unknown): value is LocalBookProgress =>
  isRecord(value) &&
  typeof value.bookId === "string" &&
  typeof value.partIndex === "number" &&
  typeof value.partPosition === "number" &&
  typeof value.updatedAt === "number";

const accountProgress = (
  account: string,
): Record<string, LocalBookProgress> => {
  const all = readJson(AUDIOBOOK_PROGRESS_KEY);
  const mine = all[account];
  if (!isRecord(mine)) return {};
  const result: Record<string, LocalBookProgress> = {};
  for (const [bookId, progress] of Object.entries(mine)) {
    if (isProgress(progress)) result[bookId] = progress;
  }
  return result;
};

export const getLocalProgress = (
  account: string | null,
  bookId: string,
): LocalBookProgress | null =>
  account ? (accountProgress(account)[bookId] ?? null) : null;

export const getAllLocalProgress = (
  account: string | null,
): LocalBookProgress[] =>
  account ? Object.values(accountProgress(account)) : [];

export const setLocalProgress = (
  account: string | null,
  progress: LocalBookProgress,
) => {
  if (!account) return;
  const all = readJson(AUDIOBOOK_PROGRESS_KEY);
  const mine = isRecord(all[account]) ? all[account] : {};
  writeJson(AUDIOBOOK_PROGRESS_KEY, {
    ...all,
    [account]: { ...mine, [progress.bookId]: progress },
  });
};

export const removeLocalProgress = (account: string | null, bookId: string) => {
  if (!account) return;
  const all = readJson(AUDIOBOOK_PROGRESS_KEY);
  const mine = isRecord(all[account]) ? { ...all[account] } : {};
  delete mine[bookId];
  writeJson(AUDIOBOOK_PROGRESS_KEY, { ...all, [account]: mine });
};

// ----------------------------------------------------------------- session

/** The book loaded in the player and what is queued after it. */
export interface AudiobookSession {
  account: string;
  book: Audiobook;
  partIndex: number;
  partPosition: number;
  queue: Audiobook[];
}

const isBook = (value: unknown): value is Audiobook =>
  isRecord(value) &&
  typeof value.id === "string" &&
  Array.isArray(value.parts) &&
  value.parts.length > 0;

export const loadSession = (): AudiobookSession | null => {
  const session = readJson(AUDIOBOOK_SESSION_KEY);
  if (
    typeof session.account !== "string" ||
    !isBook(session.book) ||
    typeof session.partIndex !== "number" ||
    typeof session.partPosition !== "number"
  ) {
    return null;
  }
  return {
    account: session.account,
    book: session.book,
    partIndex: session.partIndex,
    partPosition: session.partPosition,
    queue: Array.isArray(session.queue) ? session.queue.filter(isBook) : [],
  };
};

export const saveSession = (session: AudiobookSession) =>
  writeJson(AUDIOBOOK_SESSION_KEY, {
    ...session,
    book: slimBook(session.book),
    queue: session.queue.map(slimBook),
  });

export const clearSession = () => {
  try {
    storage.remove(AUDIOBOOK_SESSION_KEY);
  } catch {
    // Nothing to clear.
  }
};

// --------------------------------------------------------------- downloads

export interface DownloadedBook {
  book: Audiobook;
  downloadedAt: number;
}

const isDownloadedBook = (value: unknown): value is DownloadedBook =>
  isRecord(value) &&
  isBook(value.book) &&
  typeof value.downloadedAt === "number";

const allDownloadedBooks = (): Record<string, DownloadedBook> => {
  const all = readJson(AUDIOBOOK_DOWNLOADS_KEY);
  const result: Record<string, DownloadedBook> = {};
  for (const [bookId, entry] of Object.entries(all)) {
    if (isDownloadedBook(entry)) result[bookId] = entry;
  }
  return result;
};

/** The books downloaded from one server, newest first. */
export const getDownloadedBooks = (
  serverId: string | null | undefined,
): DownloadedBook[] =>
  Object.values(allDownloadedBooks())
    .filter((entry) => !serverId || entry.book.serverId === serverId)
    .sort((a, b) => b.downloadedAt - a.downloadedAt);

export const getDownloadedBook = (bookId: string): DownloadedBook | null =>
  allDownloadedBooks()[bookId] ?? null;

export const registerDownloadedBook = (book: Audiobook) => {
  const all = allDownloadedBooks();
  writeJson(AUDIOBOOK_DOWNLOADS_KEY, {
    ...all,
    [book.id]: {
      book: slimBook(book),
      downloadedAt: all[book.id]?.downloadedAt ?? Date.now(),
    },
  });
};

export const unregisterDownloadedBook = (bookId: string) => {
  const all = allDownloadedBooks();
  delete all[bookId];
  writeJson(AUDIOBOOK_DOWNLOADS_KEY, all);
};

// --------------------------------------------------------------- bookmarks

export interface AudiobookBookmark {
  id: string;
  /** Seconds into the book. */
  position: number;
  createdAt: number;
  /** The chapter it was made in, for the list. */
  chapterTitle?: string | null;
}

const isBookmark = (value: unknown): value is AudiobookBookmark =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.position === "number" &&
  typeof value.createdAt === "number";

const accountBookmarks = (
  account: string,
): Record<string, AudiobookBookmark[]> => {
  const all = readJson(AUDIOBOOK_BOOKMARKS_KEY);
  const mine = all[account];
  if (!isRecord(mine)) return {};
  const result: Record<string, AudiobookBookmark[]> = {};
  for (const [bookId, list] of Object.entries(mine)) {
    if (Array.isArray(list)) result[bookId] = list.filter(isBookmark);
  }
  return result;
};

const writeBookmarks = (
  account: string,
  bookId: string,
  bookmarks: AudiobookBookmark[],
) => {
  const all = readJson(AUDIOBOOK_BOOKMARKS_KEY);
  const mine = isRecord(all[account]) ? all[account] : {};
  writeJson(AUDIOBOOK_BOOKMARKS_KEY, {
    ...all,
    [account]: { ...mine, [bookId]: bookmarks },
  });
};

/** A book's bookmarks in the order they come in the book. */
export const getBookmarks = (
  account: string | null,
  bookId: string,
): AudiobookBookmark[] =>
  account
    ? [...(accountBookmarks(account)[bookId] ?? [])].sort(
        (a, b) => a.position - b.position,
      )
    : [];

export const addBookmark = (
  account: string | null,
  bookId: string,
  position: number,
  chapterTitle?: string | null,
): AudiobookBookmark | null => {
  if (!account) return null;
  const bookmark: AudiobookBookmark = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    position: Math.max(position, 0),
    createdAt: Date.now(),
    chapterTitle: chapterTitle ?? null,
  };
  writeBookmarks(account, bookId, [
    ...(accountBookmarks(account)[bookId] ?? []),
    bookmark,
  ]);
  return bookmark;
};

export const removeBookmark = (
  account: string | null,
  bookId: string,
  bookmarkId: string,
) => {
  if (!account) return;
  writeBookmarks(
    account,
    bookId,
    (accountBookmarks(account)[bookId] ?? []).filter(
      (bookmark) => bookmark.id !== bookmarkId,
    ),
  );
};
