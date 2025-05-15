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
  const kbps = bitrate / 1000;
  const mbps = (bitrate / 1000000).toFixed(2);

  return `${mbps} Mb/s`;
};

export function isBaseItemDto(item: any): item is BaseItemDto {
  return item && "BackdropImageTags" in item && "ImageTags" in item;
}
