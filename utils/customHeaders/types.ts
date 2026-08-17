/**
 * A single custom HTTP header used to authenticate against a reverse proxy in
 * front of a self-hosted service (Cloudflare Zero Trust, Pangolin, ...).
 *
 * The value never lives in MMKV: it is written to SecureStore under
 * `secureValueKey` and only resolved into `value` in memory when needed.
 */
export interface CustomHeader {
  /** Header name, e.g. "CF-Access-Client-Id". */
  key: string;
  /** Header value. Empty in persisted metadata — see `secureValueKey`. */
  value: string;
  /** Whether the header is sent with requests. */
  enabled: boolean;
  /** SecureStore key holding the real value. */
  secureValueKey?: string;
  /**
   * The preset this row came from, when it came from one. A gateway's headers
   * are a set — a Cloudflare service token is the id *and* the secret, and
   * either alone is rejected exactly like sending nothing — so rows that share
   * this are shown, toggled and removed together.
   */
  presetId?: string;
}

/** Integrations that can be put behind the same proxy as Jellyfin. */
export type IntegrationKey = "jellyseerr" | "streamystats" | "marlin";

/** Where an integration takes its custom headers from. */
export type HeaderSource = "jellyfin" | "custom" | "none";

/** Per-integration header configuration. */
export interface HeaderConfig {
  source: HeaderSource;
  customHeaders: CustomHeader[];
}
