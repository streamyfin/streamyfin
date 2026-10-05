import { logAndCaptureError } from "@/utils/log";
import { storage } from "@/utils/mmkv";

// Raw readers for the persisted settings blobs. They exist so early-startup
// code (Sentry consent runs before Jotai hydrates) and the settings atoms
// parse the same storage the same way — keep key names and parsing in sync
// here, not in call sites.
export const SETTINGS_KEY = "settings";
export const PLUGIN_SETTINGS_KEY = "STREAMYFIN_PLUGIN_SETTINGS";
export const PLUGIN_APPLIED_DEFAULTS_KEY = "STREAMYFIN_PLUGIN_APPLIED_DEFAULTS";

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

/**
 * The app language in effect, read before the settings atoms hydrate: the one
 * the plugin locks, else the one the user picked, else the plugin's default.
 * The same order `resolveEffectiveSettings` gives it once they have.
 *
 * i18n starts from this. The atoms hydrate in an effect, after the first
 * requests have left, and those carry the current language to the server
 * (`Accept-Language`): starting in the device language would have a Jellyfin 12
 * server answer them in it, and open the websocket in it.
 */
export const readStoredAppLanguage = (): string | undefined => {
  const own = readStoredSettings().preferedLanguage;
  const plugin = readStoredPluginSettings().preferedLanguage;
  const language = plugin?.locked ? plugin.value : own || plugin?.value;
  return typeof language === "string" && language ? language : undefined;
};
