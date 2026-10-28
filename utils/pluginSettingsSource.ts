/**
 * Where the Streamyfin plugin's settings come from.
 *
 * The plugin serves two endpoints and the difference between them is the whole
 * point of asking the right one:
 *
 * - `v1/config/resolved` answers with what applies to *this* caller. The server
 *   merges its three targeting levels (what it declares for everyone, then the
 *   caller's groups, then anything aimed at that account alone), and removes the
 *   credentials for a caller who is not an administrator: an administrator's
 *   answer still carries them, so it is redacted before it is logged.
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
import { RESOLVED_SETTINGS_RETRY_MS } from "@/constants/Plugin";
import type { PluginLockableSettings } from "@/utils/atoms/settings";
import { isPlainObject, markExpectedError } from "@/utils/errors";
import { writeErrorLog } from "@/utils/log";

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
  /** The server's address, which what one server lacks is remembered by. */
  basePath: string;
  get<T>(
    url: string,
  ): Promise<{ data: T; status?: number; headers?: Record<string, unknown> }>;
}

/**
 * A route the server does not serve, which is how a plugin too old to resolve
 * anything identifies itself.
 */
const isMissingRoute = (error: unknown): boolean =>
  (error as { response?: { status?: number } } | undefined)?.response
    ?.status === 404;

/**
 * The servers whose plugin answered 404 for the resolved route and then served
 * its stored configuration, by address, with when to ask again. Not asked at
 * every refresh, nor at every sign in, which builds a new `Api`; asked again
 * after a while, which finds a plugin updated in the meantime.
 */
const withoutResolvedRoute = new Map<string, number>();

/**
 * An answer that arrived and is not the plugin's. Something in front of the
 * server sent it in the server's place, which is the user's network rather
 * than a fault of the app's: it fails like an unreachable server, and is
 * marked expected so it never becomes a Sentry event. Every refresh then fails
 * the same way, so it is logged, with the route, the status and the kind of
 * body, never the body, which can name the person.
 */
const notThePluginsAnswer = (
  message: string,
  route: string,
  answer: { status?: number; headers?: Record<string, unknown> },
): Error => {
  writeErrorLog(
    `${message}: ${route} answered ${answer.status ?? "?"}, ${String(answer.headers?.["content-type"] ?? "no content type")}`,
  );
  return markExpectedError(new Error(message));
};

/**
 * The parts of the plugin's stored configuration. A configuration without its
 * settings block holds only these; anything else is somebody else's answer.
 */
const CONFIG_KEYS: ReadonlySet<string> = new Set([
  "settings",
  "notifications",
  "other",
]);

/** The blocks this app reads, whose entries carry the locks (readIntegrationBlocks). */
const KNOWN_BLOCKS: ReadonlySet<string> = new Set(["seerr"]);

/**
 * The settings map in what a route answered, or undefined when it is not one.
 *
 * Both routes answer with a map of key to `{ locked, value }`. A 200 that is
 * anything else is not an answer about the plugin: a captive portal's login
 * page arrives the same way, and so can a JSON error, and reading either as the
 * admin's policy would drop every lock they set. So a map that is not empty
 * has to hold a setting or a block this app reads.
 *
 * `value` can be missing: the plugin leaves a null out, so a locked "no cap"
 * quality arrives as `{ locked: true }`. An entry that is neither a setting nor
 * a known block, such as a block or a plain value a newer plugin adds, is left
 * out rather than failing the whole answer: the plugin keeps the flat keys
 * until the apps in the field read the block.
 */
const settingsMapOf = (value: unknown): PluginLockableSettings | undefined => {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const entries = Object.entries(value);
  const read = entries.filter(
    ([key, entry]) =>
      isPlainObject(entry) &&
      (KNOWN_BLOCKS.has(key) || typeof entry.locked === "boolean"),
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
  const asksResolved =
    (withoutResolvedRoute.get(api.basePath) ?? 0) <= Date.now();
  if (asksResolved) {
    try {
      const answer = await api.get<unknown>(RESOLVED_SETTINGS_PATH);
      const map = settingsMapOf(answer.data);
      if (!map) {
        throw notThePluginsAnswer(
          "The resolved plugin settings are not a settings map",
          RESOLVED_SETTINGS_PATH,
          answer,
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
    }
  }

  try {
    const answer = await api.get<unknown>(LEGACY_CONFIG_PATH);
    // The plugin is older once its own configuration answers, which a 404
    // alone did not say: a proxy answers 404 for everything while the server
    // restarts, and something else can answer 200 in the plugin's place.
    const older = () => {
      if (asksResolved) {
        withoutResolvedRoute.set(
          api.basePath,
          Date.now() + RESOLVED_SETTINGS_RETRY_MS,
        );
      }
    };
    const { data } = answer;
    if (!isPlainObject(data)) {
      throw notThePluginsAnswer(
        "The plugin configuration is not an object",
        LEGACY_CONFIG_PATH,
        answer,
      );
    }
    // An administrator can save the configuration without its settings block,
    // and the plugin then serves it without one: there is nothing to apply.
    // Only its own parts, though: a JSON error is not a configuration.
    const { settings } = data;
    if (settings == null) {
      if (!Object.keys(data).every((key) => CONFIG_KEYS.has(key))) {
        throw notThePluginsAnswer(
          "The plugin configuration is not the plugin's",
          LEGACY_CONFIG_PATH,
          answer,
        );
      }
      older();
      return undefined;
    }
    const map = settingsMapOf(settings);
    if (!map) {
      throw notThePluginsAnswer(
        "The plugin configuration's settings are not a settings map",
        LEGACY_CONFIG_PATH,
        answer,
      );
    }
    older();
    return map;
  } catch (error) {
    if (!isMissingRoute(error)) {
      throw error;
    }
    return undefined;
  }
};
