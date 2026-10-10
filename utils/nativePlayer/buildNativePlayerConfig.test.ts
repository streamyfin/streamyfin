import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import i18next from "i18next";
import type { NativePlayerStrings } from "@/modules/mpv-player";
import { setJellyfinHeaders } from "@/test-utils/customHeaders";
import type { Settings } from "@/utils/atoms/settings";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { buildNativePlayerConfig } from "./buildNativePlayerConfig";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// The log module reaches Sentry, whose client keeps a timer running past the
// last test.
jest.mock("@/utils/log", () => ({
  writeToLog: () => undefined,
  writeInfoLog: () => undefined,
  writeErrorLog: () => undefined,
  writeDebugLog: () => undefined,
  logAndCaptureError: () => undefined,
}));
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
jest.mock("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
jest.mock("@/utils/profiles/native", () => ({
  generateDeviceProfile: () => ({}),
}));
jest.mock("@/utils/subtitles/subtitleStyle", () => ({
  buildSubtitleStyle: () => ({}),
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
