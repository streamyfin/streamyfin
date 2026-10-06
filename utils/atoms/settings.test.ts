// The mocked JellyfinProvider is what loads this in the app: `storage.get`
// and `storage.setAny`, which the plugin settings are read and written with.
import "@/augmentations/mmkv";
import { act, renderHook } from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";
import { getDefaultStore } from "jotai";
import { clearMmkv } from "@/test-utils/mmkv";
import { stubReactNative } from "@/test-utils/reactNative";
import { storage } from "@/utils/mmkv";
import { PLUGIN_SETTINGS_KEY } from "@/utils/storedSettings";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// BitrateSelector is a React component module; only the BITRATES table matters.
jest.mock("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
// JellyfinProvider drags in react-native-device-info (native at test time);
// settings.ts only reads its atoms.
jest.mock("@/providers/JellyfinProvider", () => ({
  apiAtom: jest.requireActual("jotai").atom(null),
  userAtom: jest.requireActual("jotai").atom(null),
}));
// The log module reaches Sentry and MMKV, so it is stubbed with the surface
// settings.ts and what it imports actually call.
jest.mock("@/utils/log", () => ({
  writeToLog: () => undefined,
  logAndCaptureError: (...args: unknown[]) => mockLogAndCaptureError(...args),
  writeInfoLog: () => undefined,
  writeErrorLog: () => undefined,
  writeDebugLog: () => undefined,
  readFromLog: () => [],
  useLog: () => ({ logs: [], clearLogs: () => undefined }),
  LogProvider: ({ children }: { children: unknown }) => children,
  default: jest.requireActual("jotai").atom([]),
}));

const mockLogAndCaptureError = jest.fn();

// Android TV: the only platform where ExoPlayer ships alongside a
// native-player toggle, so the only place the engine/controls split is
// observable end to end.
stubReactNative({ OS: "android", isTV: true });

// Required after the platform is set, not imported: settings.ts reads
// Platform once, when the module is evaluated.
const {
  getActivePlayerType,
  getActiveVideoPlayer,
  getActiveVideoPlayerEngine,
  fetchPluginSettings,
  isNativeChromeActive,
  pluginSettingsAtom,
  redactPluginSettings,
  useSettings,
  VideoPlayer,
} = require("./settings") as typeof import("./settings");
const { apiAtom } =
  require("@/providers/JellyfinProvider") as typeof import("@/providers/JellyfinProvider");

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
      getStreamyfinPluginConfig: async () => ({
        data: {
          settings: {
            jellyseerrServerUrl: {
              locked: true,
              value: "http://seerr.example",
            },
            seerr: { apiKey: { locked: false, value: "a-key" } },
          },
        },
      }),
    } as never);

    expect(settings?.seerrServerUrl).toEqual({
      locked: true,
      value: "http://seerr.example",
    });
    expect(settings?.seerrApiKey).toEqual({ locked: false, value: "a-key" });
    expect(settings && "jellyseerrServerUrl" in settings).toBe(false);
    expect(settings && "seerr" in settings).toBe(false);
  });

  // A server without the plugin has no such route. That is an answer, and the
  // only failure that says anything about the plugin.
  test("gives nothing when the server has no plugin", async () => {
    const settings = await fetchPluginSettings({
      getStreamyfinPluginConfig: async () => {
        throw answeredWith(404);
      },
    } as never);

    expect(settings).toBeUndefined();
  });

  test.each(failuresThatSayNothing)("fails when %s", async (_case, failure) => {
    await expect(
      fetchPluginSettings({
        getStreamyfinPluginConfig: async () => {
          throw failure;
        },
      } as never),
    ).rejects.toBe(failure);
  });
});

describe("refreshing the plugin settings", () => {
  const stored = {
    showCustomMenuLinks: { locked: true, value: true },
  } as never;
  const store = getDefaultStore();

  const refreshAgainst = async (getStreamyfinPluginConfig: () => unknown) => {
    store.set(apiAtom, { getStreamyfinPluginConfig } as never);
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

  test("forgets what is stored when the server has no plugin", async () => {
    await refreshAgainst(async () => {
      throw answeredWith(404);
    });

    expect(store.get(pluginSettingsAtom)).toBeUndefined();
    expect(storage.get(PLUGIN_SETTINGS_KEY)).toBeUndefined();
  });

  // A sign-in sets the new api and refreshes straight away, through the
  // refresh it took from a render that still had the previous api. Asking
  // with that one sent the previous session's token: none at all on a first
  // sign-in, and on a TV account switch the previous user's, which handed the
  // new user the settings the server resolved for the one before.
  test("asks with the api set last, not the one it was rendered with", async () => {
    const previous = jest.fn(async () => ({ data: { settings: stored } }));
    const sent = { showCustomMenuLinks: { locked: false, value: false } };
    const current = jest.fn(async () => ({ data: { settings: sent } }));

    store.set(apiAtom, { getStreamyfinPluginConfig: previous } as never);
    const { result } = await renderHook(() => useSettings());
    const refresh = result.current.refreshStreamyfinPluginSettings;

    let refreshed: unknown;
    await act(async () => {
      store.set(apiAtom, { getStreamyfinPluginConfig: current } as never);
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
    store.set(apiAtom, { getStreamyfinPluginConfig: asked } as never);
    const { result } = await renderHook(() => useSettings());

    let refreshed: unknown = "not settled";
    await act(async () => {
      const pending = result.current.refreshStreamyfinPluginSettings();
      store.set(apiAtom, null);
      answer({
        data: {
          settings: { showCustomMenuLinks: { locked: false, value: false } },
        },
      });
      refreshed = await pending;
    });

    expect(asked).toHaveBeenCalledTimes(1);
    expect(refreshed).toBeUndefined();
    expect(store.get(pluginSettingsAtom)).toEqual(stored);
    expect(storage.get(PLUGIN_SETTINGS_KEY)).toEqual(stored);
  });

  test("takes what the server sends", async () => {
    const sent = { showCustomMenuLinks: { locked: false, value: false } };
    const refreshed = await refreshAgainst(async () => ({
      data: { settings: sent },
    }));

    expect(refreshed).toEqual(sent);
    expect(store.get(pluginSettingsAtom)).toEqual(sent);
    expect(storage.get(PLUGIN_SETTINGS_KEY)).toEqual(sent);
  });
});
