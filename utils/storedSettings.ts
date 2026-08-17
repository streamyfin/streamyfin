import { storage } from "@/utils/mmkv";

// Raw readers for the persisted settings blobs. They exist so early-startup
// code (Sentry consent runs before Jotai hydrates) and the settings atoms
// parse the same storage the same way — keep key names and parsing in sync
// here, not in call sites.
export const SETTINGS_KEY = "settings";
export const PLUGIN_SETTINGS_KEY = "STREAMYFIN_PLUGIN_SETTINGS";

export const readStoredSettings = (): Record<string, unknown> => {
  try {
    const json = storage.getString(SETTINGS_KEY);
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
  }
};

export const readStoredPluginSettings = (): Record<
  string,
  { locked?: boolean; value?: unknown } | undefined
> => {
  try {
    const json = storage.getString(PLUGIN_SETTINGS_KEY);
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
  }
};
