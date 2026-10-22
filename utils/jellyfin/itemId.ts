import { JELLYFIN_ID_PARAMETER_PATTERN } from "@/constants/Jellyfin";

const JELLYFIN_ID = new RegExp(`^${JELLYFIN_ID_PARAMETER_PATTERN}$`, "i");

/**
 * Whether a value can name a Jellyfin item: an id in one of the forms the
 * server reads, JELLYFIN_ID_PARAMETER_PATTERN, with or without whitespace
 * around it, which the server ignores. The server answers what it cannot read
 * with a 400, so a caller holding a value that fails this does not ask it.
 */
export const isJellyfinId = (value: unknown): value is string =>
  typeof value === "string" && JELLYFIN_ID.test(value.trim());

/**
 * What a value refused as an id looked like, for the log: its type and length,
 * never the text, which came from a link or from an admin's settings.
 */
export const describeValueShape = (value: unknown): string => {
  if (typeof value === "string") return `string of length ${value.length}`;
  if (Array.isArray(value)) return `array of length ${value.length}`;
  if (value === null) return "null";
  return typeof value;
};
