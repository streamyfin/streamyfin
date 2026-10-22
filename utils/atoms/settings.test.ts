import { act, cleanup, renderHook } from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";
import { getDefaultStore } from "jotai";
import { clearMmkv } from "@/test-utils/mmkv";
import { stubReactNative } from "@/test-utils/reactNative";
import { markExpectedError } from "@/utils/errors";
import { storage } from "@/utils/mmkv";
import {
  type PluginSettingsReader,
  RESOLVED_SETTINGS_PATH,
  readPluginSettings,
} from "@/utils/pluginSettingsSource";
import {
  PLUGIN_APPLIED_DEFAULTS_KEY,
  PLUGIN_SETTINGS_KEY,
  SETTINGS_KEY,
} from "@/utils/storedSettings";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// BitrateSelector is a React component module; only the BITRATES table matters.
jest.mock("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
// The api atoms read react-native-device-info (native at test time);
// settings.ts only reads the atoms.
jest.mock("@/utils/atoms/api", () => ({
  apiAtom: jest.requireActual("jotai").atom(null),
  userAtom: jest.requireActual("jotai").atom(null),
}));
// The log module reaches Sentry and MMKV, so it is stubbed with the surface
// settings.ts and what it imports actually call.
jest.mock("@/utils/log", () => ({
  writeToLog: () => undefined,
  logAndCaptureError: (...args: unknown[]) => mockLogAndCaptureError(...args),
  writeInfoLog: (...args: unknown[]) => mockWriteInfoLog(...args),
  writeErrorLog: () => undefined,
  writeDebugLog: () => undefined,
  readFromLog: () => [],
  useLog: () => ({ logs: [], clearLogs: () => undefined }),
  LogProvider: ({ children }: { children: unknown }) => children,
  default: jest.requireActual("jotai").atom([]),
}));

const mockLogAndCaptureError = jest.fn();
const mockWriteInfoLog = jest.fn();

// Android TV: the only platform where ExoPlayer ships alongside a
// native-player toggle, so the only place the engine/controls split is
// observable end to end.
stubReactNative({ OS: "android", isTV: true });

// Required after the platform is set, not imported: settings.ts reads
// Platform once, when the module is evaluated.
const {
  defaultValues,
  effectiveSettingsAtom,
  getActivePlayerType,
  getActiveVideoPlayer,
  getActiveVideoPlayerEngine,
  fetchPluginSettings,
  isNativeChromeActive,
  migrateStillWatchingSetting,
  pluginSettingsAtom,
  redactPluginSettings,
  settingsAtom,
  useSettings,
  VideoPlayer,
} = require("./settings") as typeof import("./settings");
const { apiAtom } =
  require("@/utils/atoms/api") as typeof import("@/utils/atoms/api");

/** The failure axios raises once the server has answered with `status`. */
const answeredWith = (status: number) =>
  new AxiosError(
    `Request failed with status code ${status}`,
    AxiosError.ERR_BAD_RESPONSE,
    undefined,
    undefined,
    { status } as AxiosResponse,
  );

/** The failure axios raises when no answer came back at all. */
const neverAnswered = () =>
  new AxiosError("Network Error", AxiosError.ERR_NETWORK);

/** Failures that say nothing about whether the server has the plugin. */
const failuresThatSayNothing: Array<[string, Error]> = [
  ["the request never reaches the server", neverAnswered()],
  ["the server answers with an error of its own", answeredWith(503)],
  ["the answer cannot be read", new TypeError("not the plugin's config")],
  // A portal's page or a proxy's error, refused by the transport.
  [
    "the answer is not the plugin's",
    markExpectedError(new Error("not a settings map")),
  ],
];

describe("engine vs chrome resolution on Android TV", () => {
  test("the engine is honored while the native chrome is on", () => {
    const s = {
      videoPlayer: VideoPlayer.ExoPlayer,
      nativeVideoPlayerAndroidTV: true,
    };
    expect(isNativeChromeActive(s)).toBe(true); // chrome renders
    expect(getActivePlayerType(s)).toBe("exoplayer"); // engine still exo
    expect(getActiveVideoPlayerEngine(s)).toBe(VideoPlayer.ExoPlayer);
  });

  test("exo engine with the chrome off renders the exo JS view", () => {
    const s = {
      videoPlayer: VideoPlayer.ExoPlayer,
      nativeVideoPlayerAndroidTV: false,
    };
    expect(isNativeChromeActive(s)).toBe(false);
    expect(getActiveVideoPlayer(s)).toBe(VideoPlayer.ExoPlayer);
    expect(getActivePlayerType(s)).toBe("exoplayer");
  });

  test("toggle on from the mpv default keeps the mpv profile", () => {
    const s = { nativeVideoPlayerAndroidTV: true };
    expect(isNativeChromeActive(s)).toBe(true);
    expect(getActivePlayerType(s)).toBe("mpv");
    expect(getActiveVideoPlayer({})).toBe(VideoPlayer.MPV);
    expect(getActiveVideoPlayerEngine({})).toBe(VideoPlayer.MPV);
  });

  test("an unset engine pick resolves to mpv everywhere", () => {
    expect(getActivePlayerType({})).toBe("mpv");
    expect(getActiveVideoPlayerEngine(undefined)).toBe(VideoPlayer.MPV);
  });
});

describe("redactPluginSettings", () => {
  // The app log is read in the app and pasted into bug reports. The plugin
  // sends the Seerr admin key twice while its wire moves, flat under the old
  // name and inside the seerr block, and neither copy may reach the log.
  test("hides the Seerr API key in every shape the plugin sends it", () => {
    const logged = JSON.stringify(
      redactPluginSettings({
        jellyseerrApiKey: { locked: false, value: "flat-key" },
        seerr: { apiKey: { locked: false, value: "block-key" } },
      } as never),
    );

    expect(logged).not.toContain("flat-key");
    expect(logged).not.toContain("block-key");
  });
});

describe("fetchPluginSettings", () => {
  // What it returns goes back to the caller, where signing in at login reads
  // the Seerr address from it, and on to the defaults it seeds: it has to be
  // under the app's names, whatever shape the plugin sent.
  test("hands back the plugin's settings under the app's names", async () => {
    const settings = await fetchPluginSettings({
      getStreamyfinPluginSettings: async () =>
        ({
          jellyseerrServerUrl: {
            locked: true,
            value: "http://seerr.example",
          },
          seerr: { apiKey: { locked: false, value: "a-key" } },
        }) as never,
    });

    expect(settings?.seerrServerUrl).toEqual({
      locked: true,
      value: "http://seerr.example",
    });
    expect(settings?.seerrApiKey).toEqual({ locked: false, value: "a-key" });
    expect(settings && "jellyseerrServerUrl" in settings).toBe(false);
    expect(settings && "seerr" in settings).toBe(false);
  });

  // A server without the plugin serves neither route, which the transport
  // answers with undefined (utils/pluginSettingsSource). That is an answer,
  // and the only one that says anything about the plugin.
  test("gives nothing when the server has no plugin", async () => {
    const settings = await fetchPluginSettings({
      getStreamyfinPluginSettings: async () => undefined,
    });

    expect(settings).toBeUndefined();
  });

  // The refresh runs at every foreground, and against a server without the
  // plugin each one wrote "Got plugin settings" to the app log, with nothing.
  test("logs the settings only when there are some", async () => {
    mockWriteInfoLog.mockClear();

    await fetchPluginSettings({
      getStreamyfinPluginSettings: async () => undefined,
    });
    expect(mockWriteInfoLog).not.toHaveBeenCalled();

    await fetchPluginSettings({
      getStreamyfinPluginSettings: async () =>
        ({ subtitleSize: { locked: true, value: 120 } }) as never,
    });
    expect(mockWriteInfoLog).toHaveBeenCalledWith("Got plugin settings", {
      subtitleSize: { locked: true, value: 120 },
    });
  });

  test.each(failuresThatSayNothing)("fails when %s", async (_case, failure) => {
    await expect(
      fetchPluginSettings({
        getStreamyfinPluginSettings: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
  });
});

describe("the still watching migration", () => {
  test("carries the stored episode cap over to a preset", () => {
    const stored: Record<string, unknown> = {
      maxAutoPlayEpisodeCount: { key: "5", value: 5 },
    };

    expect(migrateStillWatchingSetting(stored)).toBe(true);
    expect(stored).toEqual({ stillWatchingPreset: "long" });
  });

  test("keeps a preset already chosen and drops the old key", () => {
    const stored: Record<string, unknown> = {
      maxAutoPlayEpisodeCount: { key: "Disabled", value: -1 },
      stillWatchingPreset: "short",
    };

    migrateStillWatchingSetting(stored);
    expect(stored).toEqual({ stillWatchingPreset: "short" });
  });

  // Dropping a locked value it cannot read would drop the admin's lock too.
  test("keeps a lock on a plugin cap it cannot read", async () => {
    const settings = await fetchPluginSettings({
      getStreamyfinPluginSettings: async () => ({
        maxAutoPlayEpisodeCount: { locked: true, value: null },
      }),
    } as never);

    expect(settings?.stillWatchingPreset).toEqual({
      locked: true,
      value: "default",
    });
  });

  // A locked empty preset pinned the prompt off, unchangeable.
  test("reads an empty plugin preset as no choice", async () => {
    const fetchWith = (stillWatchingPreset: unknown) =>
      fetchPluginSettings({
        getStreamyfinPluginSettings: async () => ({ stillWatchingPreset }),
      } as never);

    expect(
      (await fetchWith({ locked: true, value: "" }))?.stillWatchingPreset,
    ).toEqual({ locked: true, value: "default" });
    expect(
      (await fetchWith({ locked: false, value: null }))?.stillWatchingPreset,
    ).toBeUndefined();
  });

  test("leaves settings without the old key alone", () => {
    const stored: Record<string, unknown> = { stillWatchingPreset: "long" };

    expect(migrateStillWatchingSetting(stored)).toBe(false);
  });

  test("an empty entry under the new name does not drop the old lock", () => {
    const sent: Record<string, unknown> = {
      maxAutoPlayEpisodeCount: { locked: true, value: 2 },
      stillWatchingPreset: { locked: false, value: null },
    };

    migrateStillWatchingSetting(
      sent,
      (l) => (l as { value?: unknown } | undefined)?.value,
      (preset, l) => ({ ...(l as object), value: preset }),
    );
    expect(sent).toEqual({
      stillWatchingPreset: { locked: true, value: "short" },
    });
  });

  // The admin's lock under the old name outranks a free value under the new.
  test("a locked cap wins over an unlocked preset", () => {
    const sent: Record<string, unknown> = {
      maxAutoPlayEpisodeCount: { locked: true, value: 2 },
      stillWatchingPreset: { locked: false, value: "long" },
    };

    migrateStillWatchingSetting(
      sent,
      (l) => (l as { value?: unknown } | undefined)?.value,
      (preset, l) => ({ ...(l as object), value: preset }),
      () => undefined,
      (l) => (l as { locked?: boolean } | undefined)?.locked === true,
    );
    expect(sent).toEqual({
      stillWatchingPreset: { locked: true, value: "short" },
    });
  });

  // An admin's lock on the new name stands, even with an empty value.
  test("an empty locked preset keeps its lock over a free old cap", async () => {
    const settings = await fetchPluginSettings({
      getStreamyfinPluginSettings: async () => ({
        maxAutoPlayEpisodeCount: { locked: false, value: 5 },
        stillWatchingPreset: { locked: true, value: null },
      }),
    } as never);

    expect(settings?.stillWatchingPreset).toEqual({
      locked: true,
      value: "default",
    });
  });

  // A locked value the app cannot read would otherwise turn the prompt off.
  test("reads a plugin preset it does not know as the nearest one", () => {
    const store = getDefaultStore();
    const effectivePreset = (value: unknown, locked = true) => {
      store.set(pluginSettingsAtom, {
        stillWatchingPreset: { locked, value },
      } as never);
      return store.get(effectiveSettingsAtom).stillWatchingPreset;
    };
    try {
      expect(effectivePreset(5)).toBe("long");
      expect(effectivePreset("medium")).toBe("default");
      // Empty is not an admin's choice: it supplies nothing.
      expect(effectivePreset(null, false)).toBe("default");
    } finally {
      store.set(pluginSettingsAtom, undefined);
    }
  });

  // An admin who pinned the old cap must keep the prompt pinned.
  test("keeps the plugin's lock on the episode cap", async () => {
    const settings = await fetchPluginSettings({
      getStreamyfinPluginSettings: async () => ({
        maxAutoPlayEpisodeCount: { locked: true, value: 2 },
      }),
    } as never);

    expect(settings?.stillWatchingPreset).toEqual({
      locked: true,
      value: "short",
    });
    expect(settings && "maxAutoPlayEpisodeCount" in settings).toBe(false);
  });
});

describe("loading the stored plugin settings", () => {
  // settings.ts reads them while it is imported, through storage.get, which
  // the MMKV augmentation adds. In the app, _layout loads it first; anything
  // that imported settings.ts earlier started the admin's locks empty.
  it("reads them when nothing loaded the MMKV augmentation first", () => {
    const locks = { forwardSkipTime: { locked: true, value: 20 } };
    jest.isolateModules(() => {
      const { storage: fresh } =
        require("@/utils/mmkv") as typeof import("@/utils/mmkv");
      // A plain set: setAny comes from the augmentation this leaves out.
      fresh.set(PLUGIN_SETTINGS_KEY, JSON.stringify(locks));
      const { pluginSettingsAtom: loaded } =
        require("./settings") as typeof import("./settings");
      const { getDefaultStore: freshStore } =
        require("jotai") as typeof import("jotai");
      expect(freshStore().get(loaded)).toEqual(locks);
    });
  });
});

describe("refreshing the plugin settings", () => {
  const stored = {
    showCustomMenuLinks: { locked: true, value: true },
  } as never;
  const store = getDefaultStore();

  const refreshAgainst = async (getStreamyfinPluginSettings: () => unknown) => {
    store.set(apiAtom, { getStreamyfinPluginSettings } as never);
    const { result } = await renderHook(() => useSettings());
    let refreshed: unknown;
    await act(async () => {
      refreshed = await result.current.refreshStreamyfinPluginSettings();
    });
    return refreshed;
  };

  beforeEach(() => {
    mockLogAndCaptureError.mockClear();
    clearMmkv();
    storage.setAny(PLUGIN_SETTINGS_KEY, stored);
    store.set(pluginSettingsAtom, stored);
  });

  // The default store outlives the test: hand it back the way it was found.
  afterEach(() => {
    store.set(apiAtom, null);
    store.set(pluginSettingsAtom, undefined);
  });

  // The refresh runs every time the app comes to the foreground, which is when
  // a request is most likely to fail: the network is not back yet. Writing
  // "no plugin" over the stored copy dropped every admin lock and hid the tabs
  // the plugin turns on until the next refresh that got through. On Apple TV
  // the tab that reappears takes the app down (Sentry REACT-NATIVE-H).
  test.each(failuresThatSayNothing)(
    "keeps what is stored when %s",
    async (_case, failure) => {
      const refreshed = await refreshAgainst(async () => {
        throw failure;
      });

      expect(refreshed).toBeUndefined();
      expect(store.get(pluginSettingsAtom)).toEqual(stored);
      expect(storage.get(PLUGIN_SETTINGS_KEY)).toEqual(stored);
    },
  );

  // An unreachable server is not the app's fault and is not reported. A
  // failure that is not an HTTP one happened in the app, on an answer that
  // did arrive, and would repeat on every refresh unseen.
  test("reports a failure only when it is not an HTTP one", async () => {
    await refreshAgainst(async () => {
      throw neverAnswered();
    });
    expect(mockLogAndCaptureError).not.toHaveBeenCalled();

    const failure = new TypeError("not the plugin's config");
    await refreshAgainst(async () => {
      throw failure;
    });
    expect(mockLogAndCaptureError).toHaveBeenCalledWith(
      "Refreshing plugin settings failed",
      failure,
    );
  });

  // Something in front of the server can answer in its place with a 200 of
  // its own, a captive portal's login page or a JSON error. That is the
  // user's network, like an unreachable server: what is stored stands, and
  // nothing is reported, on a refresh that runs at every foreground. The last
  // case is the route every published plugin takes: the resolved one missing,
  // and the error in place of the stored configuration.
  test.each([
    ["a login page", "<html><body>Sign in to the Wi-Fi</body></html>", false],
    ["a JSON error", { error: "Sign in" }, false],
    ["a JSON error past a missing resolved route", { error: "Sign in" }, true],
  ])(
    "keeps what is stored and reports nothing when %s answers",
    async (_case, answer, resolvedMissing) => {
      const inFront: PluginSettingsReader = {
        basePath: `https://in-front-${_case.length}.example`,
        get: async <T>(url: string) => {
          if (resolvedMissing && url === RESOLVED_SETTINGS_PATH) {
            throw Object.assign(new Error("HTTP 404"), {
              response: { status: 404 },
            });
          }
          return { data: answer as T };
        },
      };

      const refreshed = await refreshAgainst(() => readPluginSettings(inFront));

      expect(refreshed).toBeUndefined();
      expect(store.get(pluginSettingsAtom)).toEqual(stored);
      expect(storage.get(PLUGIN_SETTINGS_KEY)).toEqual(stored);
      expect(mockLogAndCaptureError).not.toHaveBeenCalled();
    },
  );

  test("forgets what is stored when the server has no plugin", async () => {
    await refreshAgainst(async () => undefined);

    expect(store.get(pluginSettingsAtom)).toBeUndefined();
    expect(storage.get(PLUGIN_SETTINGS_KEY)).toBeUndefined();
  });

  // A sign-in sets the new api and refreshes straight away, through the
  // refresh it took from a render that still had the previous api. Asking
  // with that one sent the previous session's token: none at all on a first
  // sign-in, and on a TV account switch the previous user's, which handed the
  // new user the settings the server resolved for the one before.
  test("asks with the api set last, not the one it was rendered with", async () => {
    const previous = jest.fn(async () => stored);
    const sent = { showCustomMenuLinks: { locked: false, value: false } };
    const current = jest.fn(async () => sent);

    store.set(apiAtom, { getStreamyfinPluginSettings: previous } as never);
    const { result } = await renderHook(() => useSettings());
    const refresh = result.current.refreshStreamyfinPluginSettings;

    let refreshed: unknown;
    await act(async () => {
      store.set(apiAtom, { getStreamyfinPluginSettings: current } as never);
      refreshed = await refresh();
    });

    expect(previous).not.toHaveBeenCalled();
    expect(refreshed).toEqual(sent);
    expect(store.get(pluginSettingsAtom)).toEqual(sent);
  });

  // The answer belongs to the session that asked. One landing after a sign-out
  // or an account switch is the previous user's: written then, it put their
  // settings, an administrator's credentials included, back on the device.
  test("drops an answer that lands after the session moved on", async () => {
    let answer: (value: unknown) => void = () => {};
    const asked = jest.fn(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    store.set(apiAtom, { getStreamyfinPluginSettings: asked } as never);
    const { result } = await renderHook(() => useSettings());

    let refreshed: unknown = "not settled";
    await act(async () => {
      const pending = result.current.refreshStreamyfinPluginSettings();
      store.set(apiAtom, null);
      answer({ showCustomMenuLinks: { locked: false, value: false } });
      refreshed = await pending;
    });

    expect(asked).toHaveBeenCalledTimes(1);
    expect(refreshed).toBeUndefined();
    expect(store.get(pluginSettingsAtom)).toEqual(stored);
    expect(storage.get(PLUGIN_SETTINGS_KEY)).toEqual(stored);
  });

  // Another session's answer is dropped the same way: an account switch
  // replaces the token while the previous account's answer is on its way.
  test("drops an answer that lands after another account signed in", async () => {
    let answer: (value: unknown) => void = () => {};
    const asked = jest.fn(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    store.set(apiAtom, {
      accessToken: "alice",
      getStreamyfinPluginSettings: asked,
    } as never);
    const { result } = await renderHook(() => useSettings());

    let refreshed: unknown = "not settled";
    await act(async () => {
      const pending = result.current.refreshStreamyfinPluginSettings();
      store.set(apiAtom, {
        accessToken: "bob",
        getStreamyfinPluginSettings: asked,
      } as never);
      answer({ showCustomMenuLinks: { locked: false, value: false } });
      refreshed = await pending;
    });

    expect(refreshed).toBeUndefined();
    expect(store.get(pluginSettingsAtom)).toEqual(stored);
  });

  // The same session's api is rebuilt while the answer is on its way: at
  // launch, once the stored session is read back, and when the network changes
  // the server's address. The answer is still that session's, and dropping it
  // left a TV, which is cold started, without its plugin settings.
  test("keeps an answer when the same session's api is rebuilt meanwhile", async () => {
    const sent = { showCustomMenuLinks: { locked: false, value: false } };
    let answer: (value: unknown) => void = () => {};
    const asked = jest.fn(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const launched = {
      accessToken: "alice",
      getStreamyfinPluginSettings: asked,
    };
    store.set(apiAtom, launched as never);
    const { result } = await renderHook(() => useSettings());

    let refreshed: unknown = "not settled";
    await act(async () => {
      const pending = result.current.refreshStreamyfinPluginSettings();
      await Promise.resolve();
      store.set(apiAtom, { ...launched } as never);
      answer(sent);
      refreshed = await pending;
    });

    expect(refreshed).toEqual(sent);
    expect(store.get(pluginSettingsAtom)).toEqual(sent);
  });

  // At an account switch, what is stored is the previous account's. What it
  // signs in with goes at once: its keys, which the API-key sign-in would
  // otherwise use for the next account, and its Seerr address, where a Seerr
  // sign-in starting for the next account would send that account's password.
  // Its locks stay until the new answer replaces them in one write, so a tab
  // they turn on does not disappear and come back meanwhile.
  test("forgets what the previous account signs in with and keeps its locks", async () => {
    const previous = {
      showCustomMenuLinks: { locked: true, value: true },
      streamyStatsServerUrl: { locked: true, value: "https://stats.example" },
      seerrServerUrl: { locked: true, value: "https://seerr.example" },
      seerrApiKey: { locked: true, value: "admin-key" },
      openSubtitlesApiKey: { locked: false, value: "subtitles-key" },
    };
    storage.setAny(PLUGIN_SETTINGS_KEY, previous);
    store.set(pluginSettingsAtom, previous as never);
    const { result } = await renderHook(() => useSettings());

    await act(async () => {
      result.current.forgetPluginSignIns();
    });

    const kept = {
      showCustomMenuLinks: { locked: true, value: true },
      streamyStatsServerUrl: { locked: true, value: "https://stats.example" },
    };
    expect(store.get(pluginSettingsAtom)).toEqual(kept);
    expect(storage.get(PLUGIN_SETTINGS_KEY)).toEqual(kept);
  });

  test("forgets the Seerr key and address in every shape they can be stored under", async () => {
    const previous = {
      showCustomMenuLinks: { locked: true, value: true },
      jellyseerrServerUrl: { locked: true, value: "https://flat.example" },
      jellyseerrApiKey: { locked: true, value: "flat-key" },
      seerr: {
        serverUrl: { locked: true, value: "https://block.example" },
        apiKey: { locked: true, value: "block-key" },
      },
    };
    store.set(pluginSettingsAtom, previous as never);
    const { result } = await renderHook(() => useSettings());

    await act(async () => {
      result.current.forgetPluginSignIns();
    });

    const kept = JSON.stringify(store.get(pluginSettingsAtom));
    for (const value of [
      "https://flat.example",
      "flat-key",
      "https://block.example",
      "block-key",
    ]) {
      expect(kept).not.toContain(value);
    }
  });

  // A refresh at a sign-in that gets no answer has nothing of this account to
  // keep: what is stored is the previous one's, so it goes.
  test.each(failuresThatSayNothing)(
    "leaves nothing of the previous account when the sign-in's refresh fails because %s",
    async (_case, failure) => {
      store.set(apiAtom, {
        accessToken: "bob",
        getStreamyfinPluginSettings: async () => {
          throw failure;
        },
      } as never);
      const { result } = await renderHook(() => useSettings());

      await act(async () => {
        await result.current.refreshStreamyfinPluginSettings({
          atSignIn: true,
        });
      });

      expect(store.get(pluginSettingsAtom)).toBeUndefined();
      expect(storage.get(PLUGIN_SETTINGS_KEY)).toBeUndefined();
    },
  );

  // Nor does a failure clear anything once the session moved on again: what
  // is stored by then is the next sign-in's business.
  test("leaves the next session's settings alone when a sign-in's refresh fails late", async () => {
    let fail: (error: Error) => void = () => {};
    store.set(apiAtom, {
      accessToken: "bob",
      getStreamyfinPluginSettings: () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    } as never);
    const { result } = await renderHook(() => useSettings());

    await act(async () => {
      const pending = result.current.refreshStreamyfinPluginSettings({
        atSignIn: true,
      });
      store.set(apiAtom, {
        accessToken: "carol",
        getStreamyfinPluginSettings: async () => undefined,
      } as never);
      fail(new TypeError("too late"));
      await pending;
    });

    expect(store.get(pluginSettingsAtom)).toEqual(stored);
  });

  test("takes what the server sends", async () => {
    const sent = { showCustomMenuLinks: { locked: false, value: false } };
    const refreshed = await refreshAgainst(async () => sent);

    expect(refreshed).toEqual(sent);
    expect(store.get(pluginSettingsAtom)).toEqual(sent);
    expect(storage.get(PLUGIN_SETTINGS_KEY)).toEqual(sent);
  });

  // The admin's unlocked cap was applied once under its old name. Read under
  // the new one only, it looked unapplied and overwrote the user's choice.
  test("does not seed an episode cap applied under its old name again", async () => {
    store.set(settingsAtom, null);
    storage.set(
      SETTINGS_KEY,
      JSON.stringify({ stillWatchingPreset: "disabled" }),
    );
    storage.setAny(PLUGIN_APPLIED_DEFAULTS_KEY, {
      maxAutoPlayEpisodeCount: { key: "3", value: 3 },
    });

    try {
      await refreshAgainst(async () => ({
        maxAutoPlayEpisodeCount: { locked: false, value: 3 },
      }));

      expect(store.get(settingsAtom)?.stillWatchingPreset).toBe("disabled");
    } finally {
      // Unmount first: a null atom under a mounted useSettings reloads it.
      await cleanup();
      store.set(settingsAtom, null);
    }
  });
});

describe("loading the settings", () => {
  const store = getDefaultStore();

  beforeEach(() => {
    clearMmkv();
    store.set(settingsAtom, null);
  });

  afterEach(() => {
    store.set(settingsAtom, null);
  });

  // An earlier build seeded the plugin's keys into the settings, which belong
  // to the device, and every account signed in after found them there.
  test("drops a key the plugin seeded and keeps one the user typed", async () => {
    storage.set(
      SETTINGS_KEY,
      JSON.stringify({
        seerrApiKey: "admin-key",
        openSubtitlesApiKey: "my-key",
      }),
    );
    storage.setAny(PLUGIN_APPLIED_DEFAULTS_KEY, {
      seerrApiKey: "admin-key",
      openSubtitlesApiKey: "admin-subtitles-key",
    });

    await renderHook(() => useSettings());

    expect(JSON.parse(storage.getString(SETTINGS_KEY) ?? "{}")).toEqual({
      openSubtitlesApiKey: "my-key",
    });
    expect(storage.get(PLUGIN_APPLIED_DEFAULTS_KEY)).toEqual({});
  });
});

describe("the stop playback confirmation", () => {
  test("is off until the user turns it on", () => {
    // Jellyfin's Android TV app, Wholphin, Swiftfin and Plex all leave
    // playback on Back without asking.
    expect(defaultValues.confirmBeforeStoppingPlayback).toBe(false);
  });
});
