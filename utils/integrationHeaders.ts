import { storage } from "@/utils/mmkv";
import { normalizeCustomHeaders } from "@/utils/normalizeCustomHeaders";
import {
  type CustomHeader,
  getServerCustomHeaders,
  resolveCustomHeaderValues,
  secureCustomHeaderMetadata,
} from "@/utils/secureCredentials";

const STORAGE_KEY_PREFIX = "custom_headers_config_";

export type HeaderSource = "jellyfin" | "custom" | "none";

export interface HeaderConfig {
  source: HeaderSource;
  customHeaders: CustomHeader[];
}

function configStorageKey(integrationKey: string): string {
  return `${STORAGE_KEY_PREFIX}${integrationKey}`;
}

function parseHeaderConfig(stored?: string): HeaderConfig {
  if (stored) {
    try {
      return JSON.parse(stored) as HeaderConfig;
    } catch {
      // fall through to default
    }
  }
  return { source: "jellyfin", customHeaders: [] };
}

export function updateIntegrationHeaderConfig(
  integrationKey: string,
  config: HeaderConfig,
): void {
  const previousConfig = parseHeaderConfig(
    storage.getString(configStorageKey(integrationKey)),
  );
  const customHeaders = secureCustomHeaderMetadata(
    `integration:${integrationKey}`,
    resolveCustomHeaderValues(config.customHeaders),
    previousConfig.customHeaders,
  );

  storage.set(
    configStorageKey(integrationKey),
    JSON.stringify({ ...config, customHeaders }),
  );
}

export function getIntegrationHeaderConfig(
  integrationKey: string,
): HeaderConfig {
  const config = parseHeaderConfig(
    storage.getString(configStorageKey(integrationKey)),
  );
  if (
    config.source === "custom" &&
    config.customHeaders.some((header) => header.value && !header.secureValueKey)
  ) {
    updateIntegrationHeaderConfig(integrationKey, config);
    return getIntegrationHeaderConfig(integrationKey);
  }
  return {
    ...config,
    customHeaders: resolveCustomHeaderValues(config.customHeaders),
  };
}

/**
 * Returns the effective custom HTTP headers for a given integration (e.g. "jellyseerr").
 * Reads the saved HeaderConfig from MMKV and resolves it to a plain header map.
 */
export function getIntegrationHeaders(
  integrationKey: string,
): Record<string, string> {
  const serverUrl = storage.getString("serverUrl");
  const config = getIntegrationHeaderConfig(integrationKey);

  if (config.source === "jellyfin" && serverUrl) {
    return normalizeCustomHeaders(getServerCustomHeaders(serverUrl));
  }
  if (config.source === "custom") {
    return normalizeCustomHeaders(config.customHeaders);
  }
  return {};
}
