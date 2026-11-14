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
// The settings module and the bitrate list drag the settings UI in behind
// them, and none of it has a say in the headers.
jest.mock("@/utils/atoms/settings", () => ({
  getActivePlayerType: () => "mpv",
}));
jest.mock("@/utils/profiles/native", () => ({
  generateDeviceProfile: () => ({}),
}));
jest.mock("@/utils/subtitles/subtitleStyle", () => ({
  buildSubtitleStyle: () => ({}),
}));
let mockCastAvailable = true;
jest.mock("@/modules/mpv-player/src/cast", () => ({
  isCastAvailable: () => mockCastAvailable,
}));

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

// The player's Cast button hands the video off to a receiver: only online and with Cast; the player hides it in a
// SyncPlay group.
describe("the native player's Cast button", () => {
  const castButton = async (options: { offline?: boolean } = {}) => {
    jest.mocked(getStreamUrl).mockResolvedValue({
      url: `${SERVER}/Videos/1/stream.mkv`,
      sessionId: "session-1",
      mediaSource: { Id: "source-1", MediaStreams: [] },
    } as Awaited<ReturnType<typeof getStreamUrl>>);
    const downloaded = {
      item,
      videoFilePath: "file:///downloads/movie.mkv",
      mediaSource: { Id: "source-1", MediaStreams: [] },
      userData: {},
    };

    const built = await buildNativePlayerConfig({
      api,
      userId: "user-1",
      settings: {
        playbackSpeedPerShow: {},
        playbackSpeedPerMedia: {},
      } as Settings,
      req: { itemId: "item-1", offline: options.offline ?? false },
      getDownloadedItemById: () => downloaded as never,
      strings: {} as NativePlayerStrings,
      originalLabel: "Original",
      item,
      outputPickerStrings: { title: "Play on" } as never,
    });
    return built?.config.ui;
  };

  afterEach(() => {
    mockCastAvailable = true;
  });

  test("is offered online, with the sheet's texts", async () => {
    const ui = await castButton();

    expect(ui?.allowCast).toBe(true);
    expect(ui?.outputPickerStrings?.title).toBe("Play on");
  });

  test("is not offered offline", async () => {
    expect((await castButton({ offline: true }))?.allowCast).toBe(false);
  });

  test("is not offered without the Cast module", async () => {
    mockCastAvailable = false;

    expect((await castButton())?.allowCast).toBe(false);
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
