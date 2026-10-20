import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * Generates the authorization headers for Jellyfin API requests.
 *
 * @param {Api} api - The Jellyfin API instance.
 * @returns {Record<string, string>} - The authorization headers.
 */
export const getAuthHeaders = (api: Api): Record<string, string> => ({
  Authorization: `MediaBrowser DeviceId="${api.deviceInfo.id}", Token="${api.accessToken}"`,
});

/**
 * Converts a bitrate to a human-readable string.
 *
 * @param {number} bitrate - The bitrate to convert.
 * @returns {string} - The bitrate as a human-readable string.
 */
export const bitrateToString = (bitrate: number): string => {
  const _kbps = bitrate / 1000;
  const mbps = (bitrate / 1000000).toFixed(2);

  return `${mbps} Mb/s`;
};

// `in` throws on anything that is not an object, and server data reaches here
// unchecked: a proxy's page in place of an item is a string.
export function isBaseItemDto(item: any): item is BaseItemDto {
  return (
    typeof item === "object" &&
    item !== null &&
    "BackdropImageTags" in item &&
    "ImageTags" in item
  );
}

/**
 * Whether a value is an item as Jellyfin sends one: an object with its Id.
 * What else answers 200 in the server's place (a captive portal or a proxy's
 * sign-in page, which axios hands over as a string, an empty body, JSON of
 * another shape) is not.
 */
export const isJellyfinItem = (value: unknown): value is BaseItemDto =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as { Id?: unknown }).Id === "string";
