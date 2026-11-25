import type { Audiobook } from "@/utils/audiobooks/books";
import {
  bookDuration,
  ticksToSecondsExact,
  toBookPosition,
} from "@/utils/audiobooks/books";

/** Where a book was left on this device. */
export interface LocalBookProgress {
  bookId: string;
  partIndex: number;
  /** Seconds into the part. */
  partPosition: number;
  /** When it was written, ms since the epoch. */
  updatedAt: number;
  finished?: boolean;
  /**
   * Written while the server could not be told, so it is sent once it can.
   * Holds the id of the part the position is in.
   */
  pendingSyncItemId?: string | null;
}

export interface ResumePoint {
  partIndex: number;
  /** Seconds into the part. */
  partPosition: number;
  finished: boolean;
  /** When this point was last written, ms since the epoch, null when never. */
  at: number | null;
}

const START: ResumePoint = {
  partIndex: 0,
  partPosition: 0,
  finished: false,
  at: null,
};

const dateOf = (value?: string | null) => {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
};

/**
 * Where the server has the book, from its parts' play state. Jellyfin keeps a
 * position per file: the part played last holds it, and a part it marked
 * played (it does so near the end) means the next part is where to go on.
 */
export const serverResumePoint = (book: Audiobook): ResumePoint => {
  const parts = book.parts;
  if (parts.length === 0) return START;

  let lastIndex = -1;
  let lastAt: number | null = null;
  parts.forEach((part, index) => {
    const at = dateOf(part.UserData?.LastPlayedDate);
    if (at !== null && (lastAt === null || at >= lastAt)) {
      lastAt = at;
      lastIndex = index;
    }
  });

  if (lastIndex < 0) {
    // No dates (an older server, or played elsewhere): the first part with a
    // position, else the first part not marked played.
    const withPosition = parts.findIndex(
      (part) => (part.UserData?.PlaybackPositionTicks ?? 0) > 0,
    );
    if (withPosition >= 0) {
      return {
        partIndex: withPosition,
        partPosition: ticksToSecondsExact(
          parts[withPosition].UserData?.PlaybackPositionTicks,
        ),
        finished: false,
        at: null,
      };
    }
    const unplayed = parts.findIndex((part) => !part.UserData?.Played);
    if (unplayed < 0) return { ...START, finished: true };
    return { ...START, partIndex: unplayed };
  }

  const part = parts[lastIndex];
  const position = ticksToSecondsExact(part.UserData?.PlaybackPositionTicks);
  if (position > 0) {
    return {
      partIndex: lastIndex,
      partPosition: position,
      finished: false,
      at: lastAt,
    };
  }
  if (part.UserData?.Played) {
    if (lastIndex + 1 < parts.length) {
      return {
        partIndex: lastIndex + 1,
        partPosition: 0,
        finished: false,
        at: lastAt,
      };
    }
    return { ...START, finished: true, at: lastAt };
  }
  return { partIndex: lastIndex, partPosition: 0, finished: false, at: lastAt };
};

/**
 * Where to go on: the newer of the server's point and this device's. The
 * device can be ahead after listening offline, the server after listening on
 * another device.
 */
export const resolveResumePoint = (
  book: Audiobook,
  local?: LocalBookProgress | null,
): ResumePoint => {
  const server = serverResumePoint(book);
  if (!local || local.bookId !== book.id) return server;
  if (server.at !== null && server.at > local.updatedAt) return server;
  const lastPart = Math.max(book.parts.length - 1, 0);
  return {
    partIndex: Math.min(Math.max(local.partIndex, 0), lastPart),
    partPosition: Math.max(local.partPosition, 0),
    finished: !!local.finished,
    at: local.updatedAt,
  };
};

/** How much of the book is behind the point, in seconds and as a share. */
export const bookProgress = (
  book: Audiobook,
  point: ResumePoint,
): { listened: number; duration: number; fraction: number } => {
  const duration = bookDuration(book);
  const listened = point.finished
    ? duration
    : Math.min(
        toBookPosition(book, point.partIndex, point.partPosition),
        duration,
      );
  return {
    listened,
    duration,
    fraction: duration > 0 ? listened / duration : 0,
  };
};

/** Started and not finished: the books Continue listening shows. */
export const isInProgress = (point: ResumePoint) =>
  !point.finished && (point.partIndex > 0 || point.partPosition > 0);
