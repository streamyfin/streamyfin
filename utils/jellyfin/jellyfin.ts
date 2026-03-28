import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getServerCustomHeaders } from "../secureCredentials";

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
 * Gets custom headers for a server (for use with fetch() calls).
 *
 * @param {string} serverUrl - The server URL.
 * @returns {Record<string, string>} - The custom headers.
 */
export const getCustomHeaders = (serverUrl: string): Record<string, string> => {
  const headers: Record<string, string> = {};
  const customHeaders = getServerCustomHeaders(serverUrl);
  for (const { key, value, enabled } of customHeaders) {
    if (enabled && key.trim()) {
      headers[key] = value;
    }
  }
  return headers;
};

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

export function isBaseItemDto(item: any): item is BaseItemDto {
  return item && "BackdropImageTags" in item && "ImageTags" in item;
}
