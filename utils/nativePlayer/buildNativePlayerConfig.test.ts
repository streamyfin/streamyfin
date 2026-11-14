import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import i18next from "i18next";
import type { NativePlayerStrings } from "@/modules/mpv-player";
import { setJellyfinHeaders } from "@/test-utils/customHeaders";
import type { Settings } from "@/utils/atoms/settings";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { buildNativePlayerConfig } from "./buildNativePlayerConfig";

jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);

jest.mock("@/utils/jellyfin/media/getStreamUrl", () => ({
  getStreamUrl: jest.fn(),
}));
// The settings module drags the settings UI in behind it, and none of it has
// a say in the headers.
jest.mock("@/utils/atoms/settings", () => ({
  getActivePlayerType: () => "mpv",
}));
jest.mock("@/utils/jellyfin/bitrateTest", () => ({
  detectBitrate: (...args: unknown[]) => mockDetectBitrate(...args),
}));
jest.mock("@/utils/profiles/native", () => ({
  generateDeviceProfile: () => ({}),
}));
jest.mock("@/utils/subtitles/subtitleStyle", () => ({
  buildSubtitleStyle: () => ({}),
}));

const mockDetectBitrate = jest.fn(async (..._args: unknown[]) => 12_000_000);

const SERVER = "https://jellyfin.example";
const api = { basePath: SERVER, accessToken: "token" } as Api;
const item: BaseItemDto = { Id: "item-1", Name: "Movie", Type: "Movie" };

/** The stream headers the native player is handed for one negotiated stream. */
const streamHeaders = async (stream: {
  url: string;
  requiredHttpHeaders?: Record<string, string>;
  remote?: boolean;
}) => {
  jest.mocked(getStreamUrl).mockResolvedValue({
    url: stream.url,
    sessionId: "session-1",
    mediaSource: {
      Id: "source-1",
      MediaStreams: [],
      ...(stream.remote ? { IsRemote: true, Protocol: "Http" } : {}),
    },
    requiredHttpHeaders: stream.requiredHttpHeaders,
  } as Awaited<ReturnType<typeof getStreamUrl>>);

  const built = await buildNativePlayerConfig({
    api,
    userId: "user-1",
    settings: {
      playbackSpeedPerShow: {},
      playbackSpeedPerMedia: {},
    } as Settings,
    req: { itemId: "item-1", offline: false },
    getDownloadedItemById: () => undefined,
    strings: {} as NativePlayerStrings,
    originalLabel: "Original",
    qualityLabel: (bitrate: { key: string }) =>
      bitrate.key === "Auto" ? "Auto" : bitrate.key,
    item,
  });
  return built?.config.stream.headers;
};

beforeAll(() => i18next.init({ lng: "sv", resources: {} }));
beforeEach(() => i18next.changeLanguage("sv"));
afterEach(() => setJellyfinHeaders());

describe("the native player's stream headers", () => {
  test("ask the server for the app language", async () => {
    // A Jellyfin 12 server localizes what it answers from this header.
    expect(
      await streamHeaders({ url: `${SERVER}/Videos/1/stream.mkv` }),
    ).toEqual({
      "Accept-Language": "sv",
      Authorization: 'MediaBrowser Token="token"',
    });
  });

  test("never carry a comma", async () => {
    // mpv takes the headers as one comma separated list with no escape, so a
    // weighted language list would split into broken header lines.
    await i18next.changeLanguage("sv,en;q=0.8");

    const headers = await streamHeaders({
      url: `${SERVER}/Videos/1/stream.mkv`,
    });

    expect(Object.values(headers ?? {}).join("")).not.toContain(",");
  });

  test("keep a custom header of the same name instead", async () => {
    setJellyfinHeaders({ "accept-language": "de" }, SERVER);

    expect(
      await streamHeaders({ url: `${SERVER}/Videos/1/stream.mkv` }),
    ).toEqual({
      "accept-language": "de",
      Authorization: 'MediaBrowser Token="token"',
    });
  });

  test("keep a header the media source requires instead", async () => {
    expect(
      await streamHeaders({
        url: `${SERVER}/Videos/1/stream.mkv`,
        requiredHttpHeaders: { "Accept-Language": "ja" },
      }),
    ).toMatchObject({ "Accept-Language": "ja" });
  });

  test("say nothing about the language to a remote stream", async () => {
    // The player sends its headers to whoever hosts the stream.
    expect(
      await streamHeaders({
        url: "https://cdn.example/live.m3u8",
        remote: true,
      }),
    ).toBeUndefined();
  });
});

// The "Video output" setting is Android's and only shown there. A value that
// roamed in with the settings must not reach iOS, whose player has one output.
describe("the native player's video output driver", () => {
  test("is not sent on iOS", async () => {
    jest.mocked(getStreamUrl).mockResolvedValue({
      url: `${SERVER}/Videos/1/stream.mkv`,
      sessionId: "session-1",
      mediaSource: { Id: "source-1", MediaStreams: [] },
    } as Awaited<ReturnType<typeof getStreamUrl>>);

    const built = await buildNativePlayerConfig({
      api,
      userId: "user-1",
      settings: {
        playbackSpeedPerShow: {},
        playbackSpeedPerMedia: {},
        mpvVoDriver: "gpu",
      } as Settings,
      req: { itemId: "item-1", offline: false },
      getDownloadedItemById: () => undefined,
      strings: {} as NativePlayerStrings,
      originalLabel: "Original",
      qualityLabel: (bitrate: { key: string }) =>
        bitrate.key === "Auto" ? "Auto" : bitrate.key,
      item,
    });

    expect(built?.config.engine).toBe("mpv");
    expect(built?.config.voDriver).toBeUndefined();
  });
});

describe("the native player's exit confirmation", () => {
  const confirmExit = async (confirmBeforeStoppingPlayback: boolean) => {
    jest.mocked(getStreamUrl).mockResolvedValue({
      url: `${SERVER}/Videos/1/stream.mkv`,
      sessionId: "session-1",
      mediaSource: { Id: "source-1", MediaStreams: [] },
    } as Awaited<ReturnType<typeof getStreamUrl>>);

    const built = await buildNativePlayerConfig({
      api,
      userId: "user-1",
      settings: {
        playbackSpeedPerShow: {},
        playbackSpeedPerMedia: {},
        confirmBeforeStoppingPlayback,
      } as Settings,
      req: { itemId: "item-1", offline: false },
      getDownloadedItemById: () => undefined,
      strings: {} as NativePlayerStrings,
      originalLabel: "Original",
      qualityLabel: (bitrate: { key: string }) =>
        bitrate.key === "Auto" ? "Auto" : bitrate.key,
      item,
    });
    return built?.config.ui?.confirmExitEnabled;
  };

  test("is asked for while the setting is on", async () => {
    expect(await confirmExit(true)).toBe(true);
  });

  test("is skipped once the setting is off", async () => {
    expect(await confirmExit(false)).toBe(false);
  });
});

describe("the native player's quality", () => {
  const AUTO = { key: "Auto", value: undefined };

  const CHANNEL: BaseItemDto = {
    Id: "item-1",
    Name: "Channel",
    Type: "TvChannel",
  };

  const build = async (
    bitrateValue?: number | "auto" | "max",
    defaultBitrate: Settings["defaultBitrate"] = AUTO,
    played: BaseItemDto = item,
    maxStreamingBitrate?: { value: number | undefined },
    linkInUse?: boolean,
  ) => {
    jest.mocked(getStreamUrl).mockResolvedValue({
      url: `${SERVER}/Videos/1/stream.mkv`,
      sessionId: "session-1",
      mediaSource: { Id: "source-1", MediaStreams: [] },
    } as Awaited<ReturnType<typeof getStreamUrl>>);

    return buildNativePlayerConfig({
      api,
      userId: "user-1",
      settings: {
        playbackSpeedPerShow: {},
        playbackSpeedPerMedia: {},
        defaultBitrate,
      } as Settings,
      req: { itemId: "item-1", offline: false, bitrateValue },
      getDownloadedItemById: () => undefined,
      strings: {} as NativePlayerStrings,
      originalLabel: "Original",
      qualityLabel: (bitrate: { key: string }) =>
        bitrate.key === "Auto" ? "Automatique" : bitrate.key,
      item: played,
      maxStreamingBitrate,
      linkInUse,
    });
  };

  const askedBitrate = () =>
    jest.mocked(getStreamUrl).mock.calls.at(-1)?.[0].maxStreamingBitrate;

  beforeEach(() => {
    jest.mocked(getStreamUrl).mockClear();
    mockDetectBitrate.mockClear();
  });

  // A Play command from another client names no quality: Live TV played at
  // the default there, measured or capped, and uncapped everywhere else.
  test("plays live television that names no quality uncapped, without measuring", async () => {
    await build(undefined, AUTO, CHANNEL);

    expect(mockDetectBitrate).not.toHaveBeenCalled();
    expect(askedBitrate()).toBeUndefined();
  });

  test("plays live television that names no quality uncapped under a fixed default", async () => {
    await build(undefined, { key: "4 Mb/s", value: 4_000_000 }, CHANNEL);

    expect(askedBitrate()).toBeUndefined();
  });

  test("plays live television at a bitrate picked by hand", async () => {
    await build(8_000_000, AUTO, CHANNEL);

    expect(askedBitrate()).toBe(8_000_000);
  });

  test("asks the server for what Auto measures", async () => {
    await build("auto");

    expect(mockDetectBitrate).toHaveBeenCalledWith(
      api,
      false,
      expect.objectContaining({ ratio: 0.7 }),
      { linkInUse: false },
    );
    expect(askedBitrate()).toBe(12_000_000);
  });

  // A swap: the stream it replaces still downloads over the link.
  test("measures Auto as the link in use when a stream plays over it", async () => {
    await build("auto", AUTO, item, undefined, true);

    expect(mockDetectBitrate).toHaveBeenCalledWith(
      api,
      false,
      expect.objectContaining({ ratio: 0.7 }),
      { linkInUse: true },
    );
  });

  // A track change re-negotiates the same item: measured again an hour on,
  // Auto measured the old stream's leftovers and could turn a direct play
  // into a transcode.
  test("re-negotiates at the cap it is handed, without measuring", async () => {
    await build("auto", AUTO, item, { value: 9_000_000 });

    expect(mockDetectBitrate).not.toHaveBeenCalled();
    expect(askedBitrate()).toBe(9_000_000);
  });

  test("keeps the cap Auto measured with the session", async () => {
    const built = await build("auto");

    expect(built?.seed.maxStreamingBitrate).toBe(12_000_000);
  });

  // Carried to the next episode and to every re-negotiation, where the
  // detection is reused or, an hour on, run again.
  test("stays Auto for the rest of the session", async () => {
    const built = await build("auto");

    expect(built?.seed.bitrateValue).toBe("auto");
  });

  test("lists Auto in its menu, picked, under its own entry", async () => {
    const built = await build("auto");

    expect(built?.config.tracks?.quality).toEqual([
      expect.objectContaining({
        label: "Automatique",
        jellyfinIndex: -2,
        selected: true,
      }),
      expect.objectContaining({
        label: "Max",
        jellyfinIndex: -1,
        selected: false,
      }),
      expect.objectContaining({
        label: "8 Mb/s",
        jellyfinIndex: 8_000_000,
        selected: false,
      }),
      expect.objectContaining({ label: "4 Mb/s", selected: false }),
      expect.objectContaining({ label: "2 Mb/s", selected: false }),
      expect.objectContaining({ label: "1 Mb/s", selected: false }),
      expect.objectContaining({ label: "500 Kb/s", selected: false }),
      expect.objectContaining({ label: "250 Kb/s", selected: false }),
    ]);
  });

  test("asks for no cap under Max, without measuring", async () => {
    const built = await build("max");

    expect(mockDetectBitrate).not.toHaveBeenCalled();
    expect(askedBitrate()).toBeUndefined();
    expect(built?.config.tracks?.quality?.[1]).toEqual(
      expect.objectContaining({ label: "Max", selected: true }),
    );
  });

  test("asks for a fixed quality as it is", async () => {
    await build(8_000_000);

    expect(mockDetectBitrate).not.toHaveBeenCalled();
    expect(askedBitrate()).toBe(8_000_000);
  });

  // Auto then behaves as Max does.
  test("asks for no cap when Auto measures nothing", async () => {
    mockDetectBitrate.mockRejectedValueOnce(new Error("nothing measured"));

    await build("auto");

    expect(askedBitrate()).toBeUndefined();
  });
});

// A Play command from another client, a Top Shelf or TV recommendation tile and
// a SyncPlay group all present the native player with no quality.
describe("the native player's quality, when the request names none", () => {
  const build = (defaultBitrate: Settings["defaultBitrate"]) => {
    jest.mocked(getStreamUrl).mockResolvedValue({
      url: `${SERVER}/Videos/1/stream.mkv`,
      sessionId: "session-1",
      mediaSource: { Id: "source-1", MediaStreams: [] },
    } as Awaited<ReturnType<typeof getStreamUrl>>);

    return buildNativePlayerConfig({
      api,
      userId: "user-1",
      settings: {
        playbackSpeedPerShow: {},
        playbackSpeedPerMedia: {},
        defaultBitrate,
      } as Settings,
      req: { itemId: "item-1", offline: false },
      getDownloadedItemById: () => undefined,
      strings: {} as NativePlayerStrings,
      originalLabel: "Original",
      qualityLabel: (bitrate: { key: string }) =>
        bitrate.key === "Auto" ? "Auto" : bitrate.key,
      item,
    });
  };

  const askedBitrate = () =>
    jest.mocked(getStreamUrl).mock.calls.at(-1)?.[0].maxStreamingBitrate;

  beforeEach(() => {
    jest.mocked(getStreamUrl).mockClear();
    mockDetectBitrate.mockClear();
  });

  test("is the default one, measured when it is Auto", async () => {
    const built = await build({ key: "Auto", value: undefined });

    expect(mockDetectBitrate).toHaveBeenCalledWith(
      api,
      false,
      expect.objectContaining({ ratio: 0.7 }),
      { linkInUse: false },
    );
    expect(askedBitrate()).toBe(12_000_000);
    expect(built?.seed.bitrateValue).toBe("auto");
  });

  test("is the default one when it is a fixed quality", async () => {
    const built = await build({ key: "8 Mb/s", value: 8_000_000 });

    expect(mockDetectBitrate).not.toHaveBeenCalled();
    expect(askedBitrate()).toBe(8_000_000);
    expect(built?.config.tracks?.quality?.[2]).toEqual(
      expect.objectContaining({ label: "8 Mb/s", selected: true }),
    );
  });

  test("is no cap when the default is Max", async () => {
    const built = await build({ key: "Max", value: undefined });

    expect(mockDetectBitrate).not.toHaveBeenCalled();
    expect(askedBitrate()).toBeUndefined();
    expect(built?.seed.bitrateValue).toBe("max");
  });
});

describe("the native player's swipe gestures", () => {
  const swipeOptions = async (swipeSettings: Partial<Settings>) => {
    jest.mocked(getStreamUrl).mockResolvedValue({
      url: `${SERVER}/Videos/1/stream.mkv`,
      sessionId: "session-1",
      mediaSource: { Id: "source-1", MediaStreams: [] },
    } as Awaited<ReturnType<typeof getStreamUrl>>);

    const built = await buildNativePlayerConfig({
      api,
      userId: "user-1",
      settings: {
        playbackSpeedPerShow: {},
        playbackSpeedPerMedia: {},
        enableHorizontalSwipeSkip: true,
        enableLeftSideBrightnessSwipe: true,
        enableRightSideVolumeSwipe: true,
        ...swipeSettings,
      } as Settings,
      req: { itemId: "item-1", offline: false },
      getDownloadedItemById: () => undefined,
      strings: {} as NativePlayerStrings,
      originalLabel: "Original",
      qualityLabel: (bitrate: { key: string }) =>
        bitrate.key === "Auto" ? "Auto" : bitrate.key,
      item,
    });
    const ui = built?.config.ui;
    return {
      horizontalSwipeSeekEnabled: ui?.horizontalSwipeSeekEnabled,
      brightnessSwipeEnabled: ui?.brightnessSwipeEnabled,
      volumeSwipeEnabled: ui?.volumeSwipeEnabled,
    };
  };

  // #2217: the native players scrubbed and changed brightness and volume
  // whatever these switches said, because they never reached them.
  test.each([
    ["enableHorizontalSwipeSkip", "horizontalSwipeSeekEnabled"],
    ["enableLeftSideBrightnessSwipe", "brightnessSwipeEnabled"],
    ["enableRightSideVolumeSwipe", "volumeSwipeEnabled"],
  ] as const)("turning off %s turns off only %s", async (setting, option) => {
    expect(await swipeOptions({ [setting]: false })).toEqual({
      horizontalSwipeSeekEnabled: true,
      brightnessSwipeEnabled: true,
      volumeSwipeEnabled: true,
      [option]: false,
    });
  });

  test("keeps every swipe on when the settings are unset", async () => {
    expect(
      await swipeOptions({
        enableHorizontalSwipeSkip: undefined,
        enableLeftSideBrightnessSwipe: undefined,
        enableRightSideVolumeSwipe: undefined,
      }),
    ).toEqual({
      horizontalSwipeSeekEnabled: true,
      brightnessSwipeEnabled: true,
      volumeSwipeEnabled: true,
    });
  });
});

describe("the native player's audio only mode", () => {
  const audioOnly = async (audioOnlyWhenScreenOff: boolean | undefined) => {
    jest.mocked(getStreamUrl).mockResolvedValue({
      url: `${SERVER}/Videos/1/stream.mkv`,
      sessionId: "session-1",
      mediaSource: { Id: "source-1", MediaStreams: [] },
    } as Awaited<ReturnType<typeof getStreamUrl>>);

    const built = await buildNativePlayerConfig({
      api,
      userId: "user-1",
      settings: {
        playbackSpeedPerShow: {},
        playbackSpeedPerMedia: {},
        audioOnlyWhenScreenOff,
      } as Settings,
      req: { itemId: "item-1", offline: false },
      getDownloadedItemById: () => undefined,
      strings: {} as NativePlayerStrings,
      originalLabel: "Original",
      qualityLabel: (bitrate: { key: string }) =>
        bitrate.key === "Auto" ? "Auto" : bitrate.key,
      item,
    });
    return built?.config.stream.audioOnlyWhenHidden;
  };

  // On by default: settings saved before the option existed have no value.
  test("is asked for unless the setting is off", async () => {
    expect(await audioOnly(undefined)).toBe(true);
    expect(await audioOnly(true)).toBe(true);
    expect(await audioOnly(false)).toBe(false);
  });
});
