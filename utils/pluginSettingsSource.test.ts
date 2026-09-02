import { describe, expect, test } from "bun:test";
import type { PluginLockableSettings, Settings } from "@/utils/atoms/settings";
import {
  pendingPluginDefaults,
  resolveEffectiveSettings,
} from "@/utils/atoms/settingsOverrides";
import {
  fetchPluginSettings,
  LEGACY_CONFIG_PATH,
  type PluginSettingsReader,
  RESOLVED_SETTINGS_PATH,
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

describe("fetchPluginSettings", () => {
  test("asks the server what applies to this user", async () => {
    const { api, asked } = server({
      [RESOLVED_SETTINGS_PATH]: resolvedSettings,
      [LEGACY_CONFIG_PATH]: { settings: plugin({}) },
    });

    expect(await fetchPluginSettings(api)).toEqual(resolvedSettings);
    // The stored configuration is never asked for when the server can resolve.
    expect(asked).toEqual([RESOLVED_SETTINGS_PATH]);
  });

  test("falls back to the stored configuration on a plugin too old to resolve", async () => {
    // Every published plugin is this one today, so the fallback is the normal
    // path rather than an edge case.
    const { api, asked } = server({
      [LEGACY_CONFIG_PATH]: { settings: resolvedSettings },
    });

    expect(await fetchPluginSettings(api)).toEqual(resolvedSettings);
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

    await expect(fetchPluginSettings(api)).rejects.toThrow("HTTP 401");
    expect(asked).toEqual([RESOLVED_SETTINGS_PATH]);
  });

  test("a server with no plugin has answered: there is no policy to apply", async () => {
    const { api, asked } = server({});

    expect(await fetchPluginSettings(api)).toBeUndefined();
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

    await expect(fetchPluginSettings(api)).rejects.toThrow("HTTP 503");
  });

  test("treats a configuration with no settings block as nothing to apply", async () => {
    const { api } = server({ [LEGACY_CONFIG_PATH]: {} });

    expect(await fetchPluginSettings(api)).toBeUndefined();
  });
});

describe("what the endpoints have in common", () => {
  // The reason switching endpoints is safe: both answer with the same map of
  // key -> { locked, value }, so locked pins a value and unlocked seeds a
  // default once, whichever one answered. A server that started resolving must
  // not change what any of that means.
  const defaults = { subtitleSize: 80, marlinServerUrl: "" } as Settings;
  const identity = (_key: keyof Settings, value: unknown) => value;

  test("either endpoint feeds the same locked and unlocked rules", async () => {
    const fromResolved = await fetchPluginSettings(
      server({ [RESOLVED_SETTINGS_PATH]: resolvedSettings }).api,
    );
    const fromLegacy = await fetchPluginSettings(
      server({ [LEGACY_CONFIG_PATH]: { settings: resolvedSettings } }).api,
    );

    expect(fromResolved).toEqual(fromLegacy!);

    for (const settings of [fromResolved, fromLegacy]) {
      const effective = resolveEffectiveSettings(
        { subtitleSize: 100 },
        settings,
        defaults,
        identity,
      );
      // Locked pins, over a value the user holds.
      expect(effective.subtitleSize).toBe(120);
      // Unlocked only fills a gap, and seeds storage once.
      expect(effective.marlinServerUrl).toBe("https://marlin.example");
      expect(pendingPluginDefaults(settings, {}, identity)).toEqual({
        marlinServerUrl: "https://marlin.example",
      } as Partial<Settings>);
    }
  });
});
