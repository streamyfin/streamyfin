import { storage } from "@/utils/mmkv";
import { normalizeCustomHeaders } from "@/utils/normalizeCustomHeaders";
import { getServerCustomHeaders } from "@/utils/secureCredentials";

const STORAGE_KEY_PREFIX = "custom_headers_config_";

type HeaderSource = "jellyfin" | "custom" | "none";

interface HeaderConfig {
  source: HeaderSource;
  customHeaders: { key: string; value: string; enabled: boolean }[];
}

/**
 * Returns the effective custom HTTP headers for a given integration (e.g. "jellyseerr").
 * Reads the saved HeaderConfig from MMKV and resolves it to a plain header map.
 */
export function getIntegrationHeaders(
  integrationKey: string,
): Record<string, string> {
  const serverUrl = storage.getString("serverUrl");
  const stored = storage.getString(`${STORAGE_KEY_PREFIX}${integrationKey}`);

  let config: HeaderConfig;
  if (stored) {
    try {
      config = JSON.parse(stored) as HeaderConfig;
    } catch {
      config = { source: "jellyfin", customHeaders: [] };
    }
  } else {
    config = { source: "jellyfin", customHeaders: [] };
  }

  if (config.source === "jellyfin" && serverUrl) {
    return normalizeCustomHeaders(getServerCustomHeaders(serverUrl));
  }
  if (config.source === "custom") {
    return normalizeCustomHeaders(config.customHeaders);
  }
  return {};
}
