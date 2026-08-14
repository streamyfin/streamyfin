import type { CustomHeader } from "./types";

export interface HeaderPreset {
  id: string;
  label: string;
  /** Shown under the label; the header names the preset fills in. */
  description: string;
  headers: CustomHeader[];
}

/**
 * Ready-made header pairs for the proxies people put Jellyfin behind.
 *
 * No preset for `Authorization`: Jellyfin authenticates with that header
 * itself, so a custom one is dropped rather than allowed to break the session
 * (see `RESERVED_HEADER_NAMES` in `normalize.ts`).
 */
/** Fresh rows for a preset, stamped so they stay grouped in the editor. */
export function presetRows(preset: HeaderPreset): CustomHeader[] {
  return preset.headers.map((header) => ({
    ...header,
    presetId: preset.id,
  }));
}

export const HEADER_PRESETS: HeaderPreset[] = [
  {
    id: "cloudflare",
    label: "Cloudflare Zero Trust",
    description: "CF-Access-Client-Id + CF-Access-Client-Secret",
    headers: [
      { key: "CF-Access-Client-Id", value: "", enabled: true },
      { key: "CF-Access-Client-Secret", value: "", enabled: true },
    ],
  },
  {
    id: "pangolin",
    label: "Pangolin",
    description: "P-Access-Token-Id + P-Access-Token",
    headers: [
      { key: "P-Access-Token-Id", value: "", enabled: true },
      { key: "P-Access-Token", value: "", enabled: true },
    ],
  },
];
