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
});
