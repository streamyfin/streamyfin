import type { CustomHeader } from "./secureCredentials";

export interface HeaderPreset {
  id: string;
  label: string;
  description: string;
  headers: CustomHeader[];
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
    label: "Pangolin Tunnel",
    description: "P-Access-Token-Id + P-Access-Token",
    headers: [
      { key: "P-Access-Token-Id", value: "", enabled: true },
      { key: "P-Access-Token", value: "", enabled: true },
    ],
  },
];
