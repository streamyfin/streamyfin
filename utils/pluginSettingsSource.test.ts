import type { PluginLockableSettings } from "@/utils/atoms/settings";
import {
  LEGACY_CONFIG_PATH,
  type PluginSettingsReader,
  RESOLVED_SETTINGS_PATH,
  readPluginSettings,
} from "@/utils/pluginSettingsSource";

const plugin = (
  entries: Record<string, { locked: boolean; value: unknown }>,
): PluginLockableSettings => entries as unknown as PluginLockableSettings;

/** An axios rejection, which is the only thing that identifies an absent route. */
const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status } });

/**
 * A server that answers the paths it is given and rejects with 404 for the rest,
 * recording what was asked so the order can be asserted.
 */
const server = (routes: Record<string, unknown>) => {
  const asked: string[] = [];
  const api: PluginSettingsReader = {
    get: async <T>(url: string) => {
      asked.push(url);
      if (!(url in routes)) throw httpError(404);
      const answer = routes[url];
      if (answer instanceof Error) throw answer;
      return { data: answer as T };
    },
  };
  return { api, asked };
};

const resolvedSettings = plugin({
  subtitleSize: { locked: true, value: 120 },
  marlinServerUrl: { locked: false, value: "https://marlin.example" },
});

describe("readPluginSettings", () => {
  test("asks the server what applies to this user", async () => {
    const { api, asked } = server({
      [RESOLVED_SETTINGS_PATH]: resolvedSettings,
      [LEGACY_CONFIG_PATH]: { settings: plugin({}) },
    });

    expect(await readPluginSettings(api)).toEqual(resolvedSettings);
    // The stored configuration is never asked for when the server can resolve.
    expect(asked).toEqual([RESOLVED_SETTINGS_PATH]);
  });

  test("falls back to the stored configuration on a plugin too old to resolve", async () => {
    // Every published plugin is this one today, so the fallback is the normal
    // path rather than an edge case.
    const { api, asked } = server({
      [LEGACY_CONFIG_PATH]: { settings: resolvedSettings },
    });

    expect(await readPluginSettings(api)).toEqual(resolvedSettings);
    expect(asked).toEqual([RESOLVED_SETTINGS_PATH, LEGACY_CONFIG_PATH]);
  });

  test("asks a server without the resolved route for it only once", async () => {
    // The refresh runs at every foreground, and on such a server the first
    // question is certain to fail.
    const { api, asked } = server({
      [LEGACY_CONFIG_PATH]: { settings: resolvedSettings },
    });

    await readPluginSettings(api);
    expect(await readPluginSettings(api)).toEqual(resolvedSettings);
    expect(asked).toEqual([
      RESOLVED_SETTINGS_PATH,
      LEGACY_CONFIG_PATH,
      LEGACY_CONFIG_PATH,
    ]);

    // What one server lacks says nothing about another.
    const other = server({ [RESOLVED_SETTINGS_PATH]: resolvedSettings });
    expect(await readPluginSettings(other.api)).toEqual(resolvedSettings);
    expect(other.asked).toEqual([RESOLVED_SETTINGS_PATH]);
  });

  test("does not fall back when the request failed for another reason", async () => {
    // A server that is down or a token that expired fails the same way on the
    // old path. Asking twice only doubles the wait before the same failure, and
    // treating it as an old server would hide a real one.
    const { api, asked } = server({
      [RESOLVED_SETTINGS_PATH]: httpError(401),
      [LEGACY_CONFIG_PATH]: { settings: resolvedSettings },
    });

    await expect(readPluginSettings(api)).rejects.toThrow("HTTP 401");
    expect(asked).toEqual([RESOLVED_SETTINGS_PATH]);
  });

  test("a server with no plugin has answered: there is no policy to apply", async () => {
    const { api, asked } = server({});

    expect(await readPluginSettings(api)).toBeUndefined();
    expect(asked).toEqual([RESOLVED_SETTINGS_PATH, LEGACY_CONFIG_PATH]);
  });

  test("a server that cannot be reached has not said it has no plugin", async () => {
    // The two must not look the same to the caller. Refreshing runs on every
    // foreground, so treating a flaky network as "no plugin here" would unlock
    // every setting the admin pinned until the next successful refresh.
    const { api } = server({
      [RESOLVED_SETTINGS_PATH]: httpError(404),
      [LEGACY_CONFIG_PATH]: httpError(503),
    });

    await expect(readPluginSettings(api)).rejects.toThrow("HTTP 503");
  });

  // Undefined is the answer "no plugin here", and it clears the admin's policy.
  // A 200 that carries no settings map has not said that: a captive portal's
  // login page arrives the same way, so it fails like an unreachable server.
  test.each([
    ["a login page", "<html><body>Sign in to the Wi-Fi</body></html>"],
    ["an empty body", null],
    ["a list", []],
  ])("refuses %s in place of the resolved settings", async (_case, answer) => {
    const { api, asked } = server({
      [RESOLVED_SETTINGS_PATH]: answer,
      [LEGACY_CONFIG_PATH]: { settings: resolvedSettings },
    });

    await expect(readPluginSettings(api)).rejects.toThrow("not a settings map");
    // The route exists, so the stored configuration is not asked instead.
    expect(asked).toEqual([RESOLVED_SETTINGS_PATH]);
  });

  // An administrator can save the configuration without a settings block:
  // 0.68.1.0 checks nothing on save, and leaves the null out of what it
  // serves. That server has answered, with no policy to apply.
  test.each([
    ["nothing in it", {}],
    ["only its other blocks", { notifications: {}, other: {} }],
    ["a null settings block", { settings: null }],
  ])(
    "reads a stored configuration with %s as nothing to apply",
    async (_case, answer) => {
      const { api } = server({ [LEGACY_CONFIG_PATH]: answer });

      expect(await readPluginSettings(api)).toBeUndefined();
    },
  );

  // What is not a configuration at all has said nothing, and neither has a
  // settings block that is not a map.
  test.each([
    ["a login page", "<html><body>Sign in to the Wi-Fi</body></html>"],
    ["an empty body", ""],
    ["a null body", null],
    ["a list", []],
    ["settings that are a sentence", { settings: "Sign in" }],
    ["settings that are a list", { settings: [] }],
  ])(
    "refuses %s in place of the stored configuration",
    async (_case, answer) => {
      const { api } = server({ [LEGACY_CONFIG_PATH]: answer });

      await expect(readPluginSettings(api)).rejects.toThrow(
        "plugin configuration",
      );
    },
  );

  // What a plugin from the rewrite serves. A null value is left out, Jellyfin's
  // JSON options omit it, so a locked "no cap" quality comes without one. Seerr
  // comes a second time as a bare block, whose entries carry their own locks.
  const servedByThePlugin = {
    defaultBitrate: { locked: true },
    jellyseerrServerUrl: { locked: false, value: "https://seerr.example" },
    seerr: { serverUrl: { locked: false, value: "https://seerr.example" } },
  };

  test.each([
    ["the plugin's own answer", servedByThePlugin],
    ["an empty map", {}],
  ])("takes %s from either route", async (_case, map) => {
    expect(
      await readPluginSettings(server({ [RESOLVED_SETTINGS_PATH]: map }).api),
    ).toEqual(map);
    expect(
      await readPluginSettings(
        server({ [LEGACY_CONFIG_PATH]: { settings: map } }).api,
      ),
    ).toEqual(map);
  });

  // A plugin newer than the app can serve a block the app does not know yet.
  // It is left out, and the rest of the answer still applies.
  test("leaves out a block it does not know, from either route", async () => {
    const newer = {
      ...servedByThePlugin,
      streamystats: { serverUrl: { locked: false, value: "https://stats" } },
    };

    expect(
      await readPluginSettings(server({ [RESOLVED_SETTINGS_PATH]: newer }).api),
    ).toEqual(servedByThePlugin);
    expect(
      await readPluginSettings(
        server({ [LEGACY_CONFIG_PATH]: { settings: newer } }).api,
      ),
    ).toEqual(servedByThePlugin);
  });

  // A JSON 200 can be somebody else's answer too. Every entry of a settings map
  // is an object, and one that is not empty holds a setting or the seerr block.
  test.each([
    ["an error message", { error: "Sign in" }],
    ["an error object", { error: { code: 401, message: "Sign in" } }],
    ["an entry without its lock", { subtitleSize: { value: 120 } }],
    ["a lock that is not a boolean", { subtitleSize: { locked: "true" } }],
    ["a seerr block that is a sentence", { seerr: "Sign in" }],
  ])("refuses a map that holds %s, from either route", async (_case, map) => {
    await expect(
      readPluginSettings(server({ [RESOLVED_SETTINGS_PATH]: map }).api),
    ).rejects.toThrow("not a settings map");
    await expect(
      readPluginSettings(
        server({ [LEGACY_CONFIG_PATH]: { settings: map } }).api,
      ),
    ).rejects.toThrow("not a settings map");
  });
});
