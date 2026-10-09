/**
 * Where the Streamyfin plugin's settings come from.
 *
 * The plugin serves two endpoints and the difference between them is the whole
 * point of asking the right one:
 *
 * - `v1/config/resolved` answers with what applies to *this* caller. The server
 *   merges its three targeting levels (what it declares for everyone, then the
 *   caller's groups, then anything aimed at that account alone) and removes the
 *   credentials on the way out.
 * - `config` answers with what the server *stores*. An administrator gets the
 *   global configuration raw and unresolved, on purpose: the admin pages save
 *   what they load, so serving a resolved view there would write one admin's own
 *   group overrides back into everybody's configuration.
 *
 * The app consumes settings, it never edits them, so it wants the first one.
 * Reading the second gave an administrator who belongs to a targeted group the
 * values the server stores rather than the ones aimed at them, and gave every
 * other account the resolved set only as a side effect of the server filtering
 * its answer.
 *
 * No published plugin serves `v1/config/resolved` yet, so the fallback below is
 * the normal path today rather than an edge case, and stays correct afterwards:
 * `config` keeps working, it is just the wrong question.
 */
import type { PluginLockableSettings } from "@/utils/atoms/settings";
import { markExpectedError } from "@/utils/errors";

/** What applies to the caller, resolved and redacted by the server. */
export const RESOLVED_SETTINGS_PATH = "/Streamyfin/v1/config/resolved";

/** What the server stores. Older plugins serve only this. */
export const LEGACY_CONFIG_PATH = "/Streamyfin/config";

/**
 * The slice of the Jellyfin `Api` this needs.
 *
 * Narrow on purpose: the policy below is the part worth testing, and a full
 * `Api` cannot be built without a server.
 */
export interface PluginSettingsReader {
  get<T>(url: string): Promise<{ data: T }>;
}

/**
 * A route the server does not serve, which is how a plugin too old to resolve
 * anything identifies itself.
 */
const isMissingRoute = (error: unknown): boolean =>
  (error as { response?: { status?: number } } | undefined)?.response
    ?.status === 404;

/**
 * The servers that answered 404 for the resolved route, so it is not asked
 * again at every refresh. Keyed on the `Api`, which signing in again builds
 * anew: that asks once more, and finds a plugin updated in the meantime.
 */
const withoutResolvedRoute = new WeakSet<PluginSettingsReader>();

/**
 * An answer that arrived and is not the plugin's. Something in front of the
 * server sent it in the server's place, which is the user's network rather
 * than a fault of the app's: it fails like an unreachable server, and is
 * marked expected so it never becomes a Sentry event.
 */
const notThePluginsAnswer = (message: string): Error =>
  markExpectedError(new Error(message));

/** What axios makes of a body that is a JSON object. */
const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The blocks this app reads, whose entries carry the locks (readIntegrationBlocks). */
const KNOWN_BLOCKS: ReadonlySet<string> = new Set(["seerr"]);

/**
 * The settings map in what a route answered, or undefined when it is not one.
 *
 * Both routes answer with a map of key to `{ locked, value }`. A 200 that is
 * anything else is not an answer about the plugin: a captive portal's login
 * page arrives the same way, and so can a JSON error, and reading either as the
 * admin's policy would drop every lock they set. So every entry has to be an
 * object, and a map that is not empty has to hold a setting or a block this app
 * reads.
 *
 * `value` can be missing: the plugin leaves a null out, so a locked "no cap"
 * quality arrives as `{ locked: true }`. An entry that is neither a setting nor
 * a known block, such as a block a newer plugin adds, is left out rather than
 * failing the whole answer: the plugin keeps the flat keys until the apps in
 * the field read the block.
 */
const settingsMapOf = (value: unknown): PluginLockableSettings | undefined => {
  if (!isJsonObject(value)) {
    return undefined;
  }
  const entries = Object.entries(value);
  if (!entries.every(([, entry]) => isJsonObject(entry))) {
    return undefined;
  }
  const read = entries.filter(
    ([key, entry]) =>
      KNOWN_BLOCKS.has(key) ||
      typeof (entry as Record<string, unknown>).locked === "boolean",
  );
  if (entries.length > 0 && read.length === 0) {
    return undefined;
  }
  return Object.fromEntries(read) as PluginLockableSettings;
};

/**
 * The settings that apply to the signed-in user, whatever the server's age.
 *
 * Both endpoints answer with the same map of `key -> { locked, value }`, so
 * which one answered changes nothing downstream: locked still pins a value,
 * unlocked still seeds a default once, and an absent key still leaves the user
 * alone.
 *
 * Returns `undefined` when the server has said there is no policy to apply: it
 * serves neither route, which is a server without the plugin, or it stores a
 * configuration saved without its settings block.
 *
 * @throws whatever the request failed with, for anything else. A server that
 * cannot be reached has not told the caller it has no plugin, and the two must
 * not look the same to whoever decides what to keep. The same goes for an
 * answer that is not a settings map, which throws an error marked expected.
 */
export const readPluginSettings = async (
  api: PluginSettingsReader,
): Promise<PluginLockableSettings | undefined> => {
  if (!withoutResolvedRoute.has(api)) {
    try {
      const { data } = await api.get<unknown>(RESOLVED_SETTINGS_PATH);
      const map = settingsMapOf(data);
      if (!map) {
        throw notThePluginsAnswer(
          "The resolved plugin settings are not a settings map",
        );
      }
      return map;
    } catch (error) {
      // Only a missing route means "older plugin". A server that is down or a
      // token that expired would fail the same way on the old path, and asking
      // it there as well only doubles the wait before the same failure.
      if (!isMissingRoute(error)) {
        throw error;
      }
      withoutResolvedRoute.add(api);
    }
  }

  try {
    const { data } = await api.get<unknown>(LEGACY_CONFIG_PATH);
    if (!isJsonObject(data)) {
      throw notThePluginsAnswer("The plugin configuration is not an object");
    }
    // An administrator can save the configuration without its settings block,
    // and the plugin then serves it without one: there is nothing to apply.
    const { settings } = data;
    if (settings == null) {
      return undefined;
    }
    const map = settingsMapOf(settings);
    if (!map) {
      throw notThePluginsAnswer(
        "The plugin configuration's settings are not a settings map",
      );
    }
    return map;
  } catch (error) {
    if (!isMissingRoute(error)) {
      throw error;
    }
    return undefined;
  }
};
