import { storage } from "@/utils/mmkv";
import { normalizeCustomHeaders } from "./normalize";
import {
  bumpCustomHeadersVersion,
  resolveCustomHeaderValues,
  secureCustomHeaderMetadata,
} from "./secureValues";
import type { HeaderConfig, HeaderSource, IntegrationKey } from "./types";

/** MMKV holds the source choice and header names only; values go to SecureStore. */
export const INTEGRATION_CONFIG_KEY_PREFIX = "custom_headers_config_";

const DEFAULT_CONFIG: HeaderConfig = { source: "none", customHeaders: [] };

function configStorageKey(integrationKey: IntegrationKey): string {
  return `${INTEGRATION_CONFIG_KEY_PREFIX}${integrationKey}`;
}

function parseHeaderConfig(stored?: string): HeaderConfig {
  if (!stored) return { ...DEFAULT_CONFIG, customHeaders: [] };

  try {
    const parsed = JSON.parse(stored) as Partial<HeaderConfig>;
    const source: HeaderSource =
      parsed.source === "jellyfin" || parsed.source === "custom"
        ? parsed.source
        : "none";

    return {
      source,
      customHeaders: Array.isArray(parsed.customHeaders)
        ? parsed.customHeaders
        : [],
    };
  } catch {
    return { ...DEFAULT_CONFIG, customHeaders: [] };
  }
}

export function updateIntegrationHeaderConfig(
  integrationKey: IntegrationKey,
  config: HeaderConfig,
): void {
  const previousConfig = parseHeaderConfig(
    storage.getString(configStorageKey(integrationKey)),
  );
  // `config` carries the values as typed; re-reading them from SecureStore here
  // would hand back the previous secret and silently discard the edit.
  const customHeaders = secureCustomHeaderMetadata(
    `integration:${integrationKey}`,
    config.customHeaders,
    previousConfig.customHeaders,
  );

  storage.set(
    configStorageKey(integrationKey),
    JSON.stringify({ source: config.source, customHeaders }),
  );
  bumpCustomHeadersVersion();
}

export function getIntegrationHeaderConfig(
  integrationKey: IntegrationKey,
): HeaderConfig {
  const config = parseHeaderConfig(
    storage.getString(configStorageKey(integrationKey)),
  );

  return {
    source: config.source,
    customHeaders: resolveCustomHeaderValues(config.customHeaders),
  };
}

/**
 * Effective headers for an integration: either the ones configured for the
 * Jellyfin server (same proxy), its own set, or none.
 *
 * `jellyfinHeaders` is passed in so this stays independent of how the Jellyfin
 * server URL is resolved at the call site.
 */
export function resolveIntegrationHeaders(
  config: HeaderConfig,
  jellyfinHeaders: () => Record<string, string>,
): Record<string, string> {
  if (config.source === "jellyfin") return jellyfinHeaders();
  if (config.source === "custom") {
    return normalizeCustomHeaders(config.customHeaders);
  }
  return {};
}
