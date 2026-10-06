import type { PlayRequest } from "./playRequest";

/** A missing or malformed number in the command counts as not sent. */
const optionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Turns the payload of a Jellyfin WebSocket "Play" command into the item the
 * player should start, or null when the command names nothing. The one reader
 * for both "Play" subscribers, so the native player and the JS player route
 * cannot read a command differently.
 *
 * `ItemIds` never holds a container. The server expands a series, a season, a
 * collection or a playlist into the items inside it before it forwards the
 * command (SessionManager.SendPlayCommand), so there is nothing to resolve on
 * this side: a remote Play of a show arrives as the list of its episodes.
 *
 * `StartIndex` says which of the listed items to start with. The rest of the
 * list and `PlayCommand` (PlayNext, PlayLast) describe a queue, and neither
 * player has one, so only the starting item is read.
 */
export const parseRemotePlayCommand = (
  command: unknown,
): PlayRequest | null => {
  const data = (command ?? {}) as Record<string, unknown>;
  const itemIds: unknown[] = Array.isArray(data.ItemIds) ? data.ItemIds : [];

  const startIndex = optionalNumber(data.StartIndex);
  const itemId =
    (startIndex !== undefined ? itemIds[startIndex] : undefined) ?? itemIds[0];
  if (typeof itemId !== "string" || !itemId) return null;

  return {
    itemId,
    audioIndex: optionalNumber(data.AudioStreamIndex),
    subtitleIndex: optionalNumber(data.SubtitleStreamIndex),
    mediaSourceId:
      typeof data.MediaSourceId === "string" && data.MediaSourceId
        ? data.MediaSourceId
        : undefined,
    offline: false,
    playbackPositionTicks: optionalNumber(data.StartPositionTicks),
  };
};
