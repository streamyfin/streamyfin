import { logAndCaptureError } from "@/utils/log";
import { storage } from "@/utils/mmkv";

// Raw readers for the persisted settings blobs. They exist so early-startup
// code (Sentry consent runs before Jotai hydrates) and the settings atoms
// parse the same storage the same way — keep key names and parsing in sync
// here, not in call sites.
export const SETTINGS_KEY = "settings";
export const PLUGIN_SETTINGS_KEY = "STREAMYFIN_PLUGIN_SETTINGS";

// A corrupt blob silently resets every setting to defaults, so report it —
// once per blob per session, since these readers run on every consent check.
// (Reads that happen before Sentry initializes only reach the local log.)
let reportedCorruptSettings = false;
let reportedCorruptPluginSettings = false;

export const readStoredSettings = (): Record<string, unknown> => {
  try {
    const json = storage.getString(SETTINGS_KEY);
    return json ? JSON.parse(json) : {};
  } catch (error) {
    if (!reportedCorruptSettings) {
      reportedCorruptSettings = true;
      logAndCaptureError("Stored settings blob failed to parse", error);
    }
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
  } catch (error) {
    if (!reportedCorruptPluginSettings) {
      reportedCorruptPluginSettings = true;
      logAndCaptureError("Stored plugin-settings blob failed to parse", error);
    }
    return {};
  }
};
