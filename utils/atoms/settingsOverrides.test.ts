import { describe, expect, test } from "bun:test";
import type { PluginLockableSettings, Settings } from "./settings";
import {
  pendingPluginDefaults,
  pluginRefreshOverlay,
  readIntegrationBlocks,
  renameLegacySeerrSettings,
  resolveEffectiveSettings,
} from "./settingsOverrides";

const defaults = {
  rememberAudioSelections: true,
  rememberSubtitleSelections: true,
  subtitlesOnMute: false,
} as unknown as Settings;

const plugin = (
  entries: Record<string, { locked: boolean; value: unknown }>,
): PluginLockableSettings => entries as unknown as PluginLockableSettings;

/** The real normalizer only reshapes object-typed settings; identity is enough here. */
const identity = (_key: keyof Settings, value: unknown) => value;

describe("resolveEffectiveSettings", () => {
  test("an unlocked plugin value never overrides the stored value", () => {
    // The regression this rule exists for: the plugin shipped
    // rememberAudioSelections=false unlocked while the app default was true.
    // The old read-time override pinned it, so the toggle showed off, pressing
    // it wrote the value already in storage, and the write was dropped as a
    // no-op — an unlocked setting that could never be changed.
    const effective = resolveEffectiveSettings(
      { rememberAudioSelections: true },
      plugin({ rememberAudioSelections: { locked: false, value: false } }),
      defaults,
      identity,
    );
    expect(effective.rememberAudioSelections).toBe(true);
  });

  test("a locked plugin value wins over the stored value", () => {
    const effective = resolveEffectiveSettings(
      { rememberAudioSelections: true },
      plugin({ rememberAudioSelections: { locked: true, value: false } }),
      defaults,
      identity,
    );
    expect(effective.rememberAudioSelections).toBe(false);
  });

  test("stored values win over app defaults", () => {
    const effective = resolveEffectiveSettings(
      { subtitlesOnMute: true },
      undefined,
      defaults,
      identity,
    );
    expect(effective.subtitlesOnMute).toBe(true);
  });

  test("app defaults fill in keys the user never stored", () => {
    const effective = resolveEffectiveSettings(
      {},
      undefined,
      defaults,
      identity,
    );
    expect(effective.rememberSubtitleSelections).toBe(true);
  });

  test("an unlocked plugin value fills a key the user has nothing for", () => {
    // Regression: the Streamystats watchlists tab is gated on
    // streamyStatsServerUrl, which only the plugin supplies. Requiring a plugin
    // refresh to seed it first made the tab vanish after a reload.
    const effective = resolveEffectiveSettings(
      {},
      plugin({
        streamyStatsServerUrl: {
          locked: false,
          value: "https://stats.example",
        },
      }),
      defaults,
      identity,
    );
    expect((effective as Record<string, unknown>).streamyStatsServerUrl).toBe(
      "https://stats.example",
    );
  });

  test("a user's own value still beats the unlocked fallback", () => {
    const effective = resolveEffectiveSettings(
      { streamyStatsServerUrl: "https://mine.example" } as Partial<Settings>,
      plugin({
        streamyStatsServerUrl: {
          locked: false,
          value: "https://admin.example",
        },
      }),
      defaults,
      identity,
    );
    expect((effective as Record<string, unknown>).streamyStatsServerUrl).toBe(
      "https://mine.example",
    );
  });

  test("false counts as a value, so the fallback cannot re-enable a toggle", () => {
    // The original bug in one line: a stored `false` must not be read as
    // "nothing here" and replaced by the plugin's `true`.
    const effective = resolveEffectiveSettings(
      { rememberAudioSelections: false },
      plugin({ rememberAudioSelections: { locked: false, value: true } }),
      defaults,
      identity,
    );
    expect(effective.rememberAudioSelections).toBe(false);
  });
});

describe("pendingPluginDefaults", () => {
  test("seeds an unlocked default that has not been applied yet", () => {
    const pending = pendingPluginDefaults(
      plugin({ rememberAudioSelections: { locked: false, value: false } }),
      {},
      identity,
    );
    expect(pending.rememberAudioSelections).toBe(false);
  });

  test("does not re-seed a default already applied", () => {
    // Without this the admin default is written back on every plugin refresh,
    // silently reverting whatever the user chose in between.
    const pending = pendingPluginDefaults(
      plugin({ rememberAudioSelections: { locked: false, value: false } }),
      { rememberAudioSelections: false },
      identity,
    );
    expect(pending).toEqual({});
  });

  test("re-seeds when the admin changes the default", () => {
    const pending = pendingPluginDefaults(
      plugin({ rememberAudioSelections: { locked: false, value: true } }),
      { rememberAudioSelections: false },
      identity,
    );
    expect(pending.rememberAudioSelections).toBe(true);
  });

  test("compares object-typed values structurally, not by reference", () => {
    // normalize rebuilds { key, value } objects on every call, so reference
    // equality would re-seed defaultBitrate on every refresh forever.
    const pending = pendingPluginDefaults(
      plugin({
        defaultBitrate: { locked: false, value: { key: "Max", value: 0 } },
      }),
      { defaultBitrate: { key: "Max", value: 0 } },
      identity,
    );
    expect(pending).toEqual({});
  });

  test("ignores locked keys — those are pinned at read time, never stored", () => {
    const pending = pendingPluginDefaults(
      plugin({ rememberAudioSelections: { locked: true, value: false } }),
      {},
      identity,
    );
    expect(pending).toEqual({});
  });

  test("ignores values with nothing meaningful in them", () => {
    const pending = pendingPluginDefaults(
      plugin({
        rememberAudioSelections: { locked: false, value: undefined },
        rememberSubtitleSelections: { locked: false, value: "" },
      }),
      {},
      identity,
    );
    expect(pending).toEqual({});
  });

  test("never seeds consent keys, even on the first sync", () => {
    // The crash-report opt-out lives on the intro sheet, which is available
    // before the first plugin sync runs at login. Seeding the admin default
    // after the fact silently re-enabled reporting over that opt-out — the
    // user's toggle turned itself back on. Consent only moves by explicit
    // user action; an admin enforces it with a lock instead.
    const pending = pendingPluginDefaults(
      plugin({ sentryEnabled: { locked: false, value: true } }),
      {},
      identity,
    );
    expect(pending).toEqual({});
  });
});

describe("pluginRefreshOverlay", () => {
  test("computes the overlay against the settings passed in", () => {
    // The caller must pass the atom's value at write time. The refresh runs
    // while the user can be toggling (the intro sheet is up during login),
    // and the old merge from a render-time snapshot resurrected the value
    // the user had just overwritten.
    const result = pluginRefreshOverlay(
      { sentryEnabled: false } as Partial<Settings>,
      plugin({
        sentryEnabled: { locked: false, value: true },
        forwardSkipTime: { locked: false, value: 45 },
      }),
      {},
      identity,
    );
    // sentryEnabled is never seeded, so only the skip time moves.
    expect(result).toEqual({
      overlay: { forwardSkipTime: 45 },
      applied: { forwardSkipTime: 45 },
    });
  });

  // A build from before the rename recorded Seerr's defaults under their old
  // names. Read under the new ones, a default applied back then is not
  // applied again over what the user chose since, and the record comes back
  // under the new names.
  test("a default an earlier build applied is not applied again", () => {
    const applied = {
      jellyseerrServerUrl: "http://seerr.example",
      autoLoginJellyseerr: true,
    } as never;

    expect(
      pluginRefreshOverlay(
        { seerrServerUrl: "http://mine.example", autoLoginSeerr: false },
        plugin({
          seerrServerUrl: { locked: false, value: "http://seerr.example" },
          autoLoginSeerr: { locked: false, value: true },
        }),
        applied,
        identity,
      ),
    ).toBeNull();

    expect(
      pluginRefreshOverlay(
        {} as Partial<Settings>,
        plugin({
          seerrServerUrl: { locked: false, value: "http://seerr.example" },
          forwardSkipTime: { locked: false, value: 45 },
        }),
        applied,
        identity,
      )?.applied,
    ).toEqual({
      seerrServerUrl: "http://seerr.example",
      autoLoginSeerr: true,
      forwardSkipTime: 45,
    });
  });

  test("returns null when there is nothing to write", () => {
    const result = pluginRefreshOverlay(
      {} as Partial<Settings>,
      undefined,
      {},
      identity,
    );
    expect(result).toBeNull();
  });

  test("a streamystats-only refresh leaves the applied record untouched", () => {
    // Recording applied defaults for a write that seeded nothing would mark
    // pending defaults as done without ever writing them. The URL here is
    // already applied, so the only outstanding write is the search engine.
    const result = pluginRefreshOverlay(
      { searchEngine: "Jellyfin" } as Partial<Settings>,
      plugin({
        streamyStatsServerUrl: {
          locked: false,
          value: "https://stats.example",
        },
      }),
      { streamyStatsServerUrl: "https://stats.example" },
      identity,
    );
    expect(result).toEqual({
      overlay: { searchEngine: "Streamystats" },
      applied: null,
    });
  });
});

describe("readIntegrationBlocks", () => {
  test("a Seerr block becomes the app's three Seerr settings", () => {
    const read = readIntegrationBlocks(
      plugin({
        seerr: {
          locked: false,
          value: {
            serverUrl: { locked: true, value: "http://seerr.example" },
            apiKey: { locked: false, value: "a-key" },
            autoLogin: { locked: false, value: false },
          },
        },
      }),
    );

    expect(read!.seerrServerUrl).toEqual({
      locked: true,
      value: "http://seerr.example",
    });
    expect(read!.seerrApiKey).toEqual({ locked: false, value: "a-key" });
    expect(read!.autoLoginSeerr).toEqual({ locked: false, value: false });
    expect("seerr" in read!).toBe(false);
  });

  // Every plugin release before the block sends only these, and a stored
  // copy of the plugin's settings from an earlier build holds them too.
  test("a plugin that sends only the flat keys is read under the new names", () => {
    const read = readIntegrationBlocks(
      plugin({
        jellyseerrServerUrl: { locked: true, value: "http://seerr.example" },
        autoLoginJellyseerr: { locked: false, value: true },
      }),
    );

    expect(read!.seerrServerUrl).toEqual({
      locked: true,
      value: "http://seerr.example",
    });
    expect(read!.autoLoginSeerr).toEqual({ locked: false, value: true });
    expect("jellyseerrServerUrl" in read!).toBe(false);
    expect("autoLoginJellyseerr" in read!).toBe(false);
  });

  test("the block wins over the flat keys, which the plugin keeps in step", () => {
    const read = readIntegrationBlocks(
      plugin({
        jellyseerrServerUrl: { locked: false, value: "http://flat.example" },
        seerr: {
          locked: false,
          value: {
            serverUrl: { locked: false, value: "http://block.example" },
          },
        },
      }),
    );

    expect(read!.seerrServerUrl).toEqual({
      locked: false,
      value: "http://block.example",
    });
    expect("jellyseerrServerUrl" in read!).toBe(false);
  });

  test("a block naming one setting leaves the others alone", () => {
    const read = readIntegrationBlocks(
      plugin({
        seerr: {
          locked: false,
          value: { autoLogin: { locked: true, value: true } },
        },
      }),
    );

    expect(read!.autoLoginSeerr).toEqual({ locked: true, value: true });
    expect("seerrServerUrl" in read!).toBe(false);
  });

  test("a server that sends no block is handed back untouched", () => {
    const settings = plugin({
      seerrServerUrl: { locked: false, value: "http://seerr.example" },
    });

    expect(readIntegrationBlocks(settings)).toBe(settings);
    expect(readIntegrationBlocks(undefined)).toBeUndefined();
  });

  // The response is typed, not checked: a broken or foreign server can send
  // anything under `settings`, and `in` throws on a string or a number.
  test("settings that are not an object read as none instead of throwing", () => {
    for (const sent of [null, "settings", 1, true, []]) {
      expect(readIntegrationBlocks(sent as never)).toBeUndefined();
    }
  });

  test("a block that is not the shape it should be is ignored rather than thrown on", () => {
    const read = readIntegrationBlocks(
      plugin({ seerr: { locked: false, value: "not a block" } }),
    );

    expect("seerr" in read!).toBe(false);
    expect("seerrServerUrl" in read!).toBe(false);
  });
});

describe("renameLegacySeerrSettings", () => {
  test("carries the settings an earlier build stored to their new names", () => {
    const stored: Record<string, unknown> = {
      jellyseerrServerUrl: "http://seerr.example",
      jellyseerrApiKey: "a-key",
      autoLoginJellyseerr: false,
    };

    expect(renameLegacySeerrSettings(stored)).toBe(true);
    expect(stored).toEqual({
      seerrServerUrl: "http://seerr.example",
      seerrApiKey: "a-key",
      autoLoginSeerr: false,
    });
  });

  test("keeps a value already set under the new name", () => {
    const stored: Record<string, unknown> = {
      seerrServerUrl: "http://new.example",
      jellyseerrServerUrl: "http://old.example",
    };

    renameLegacySeerrSettings(stored);

    expect(stored).toEqual({ seerrServerUrl: "http://new.example" });
  });

  test("says when there was nothing to carry", () => {
    expect(renameLegacySeerrSettings({ seerrApiKey: "a-key" })).toBe(false);
  });
});
