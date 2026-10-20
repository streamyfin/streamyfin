import { JELLYFIN_ID_PATTERN } from "@/constants/Jellyfin";

const JELLYFIN_ID = new RegExp(`^(?:${JELLYFIN_ID_PATTERN})$`, "i");

/**
 * Whether a value can name a Jellyfin item. A request built on anything else
 * can only come back as a 400, so a caller holding a value that fails this has
 * nothing to ask the server for.
 */
export const isJellyfinId = (value: unknown): value is string =>
  typeof value === "string" && JELLYFIN_ID.test(value);

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
