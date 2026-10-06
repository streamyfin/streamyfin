import { LEGACY_SEERR_HEADERS_NAME } from "@/constants/Seerr";
import { logAndCaptureError } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { normalizeCustomHeaders } from "./normalize";
import {
  bumpCustomHeadersVersion,
  deleteSecureCustomHeaderValues,
  resolveCustomHeaderValues,
  secureCustomHeaderMetadata,
} from "./secureValues";
import type { HeaderConfig, HeaderSource, IntegrationKey } from "./types";

/** MMKV holds the source choice and header names only; values go to SecureStore. */
export const INTEGRATION_CONFIG_KEY_PREFIX = "custom_headers_config_";

const DEFAULT_CONFIG: HeaderConfig = { source: "none", customHeaders: [] };

let reportedCorruptHeaderConfig = false;

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
  } catch (error) {
    // Falling back silently drops the user's custom auth headers, which then
    // looks exactly like a server outage on every request. Report once per
    // session — this parser can run on every outgoing request.
    if (!reportedCorruptHeaderConfig) {
      reportedCorruptHeaderConfig = true;
      logAndCaptureError("Custom-header config failed to parse", error);
    }
    return { ...DEFAULT_CONFIG, customHeaders: [] };
  }
}

/**
 * Seerr's headers as a build from before the rename filed them, under
 * "jellyseerr". Moved on first use, secret values included, and the old
 * configuration and keys deleted: SecureStore values belong to the scope
 * that wrote them, so leaving them under the old one would orphan them.
 */
function moveLegacySeerrHeaders(): void {
  const legacyKey = `${INTEGRATION_CONFIG_KEY_PREFIX}${LEGACY_SEERR_HEADERS_NAME}`;
  const legacy = storage.getString(legacyKey);
  if (legacy === undefined) return;

  const config = parseHeaderConfig(legacy);
  if (storage.getString(configStorageKey("seerr")) === undefined) {
    const customHeaders = secureCustomHeaderMetadata(
      "integration:seerr",
      resolveCustomHeaderValues(config.customHeaders),
      [],
    );
    storage.set(
      configStorageKey("seerr"),
      JSON.stringify({ source: config.source, customHeaders }),
    );
  }
  deleteSecureCustomHeaderValues(config.customHeaders);
  storage.remove(legacyKey);
}

export function updateIntegrationHeaderConfig(
  integrationKey: IntegrationKey,
  config: HeaderConfig,
): void {
  if (integrationKey === "seerr") moveLegacySeerrHeaders();
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
  if (integrationKey === "seerr") moveLegacySeerrHeaders();
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
