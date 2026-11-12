import type { TFunction } from "i18next";
import { makeApi } from "@/test-utils/jellyfinApi";
import { stubReactNative } from "@/test-utils/reactNative";

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
  logAndCaptureError: () => undefined,
  writeInfoLog: () => undefined,
  writeErrorLog: () => undefined,
  writeDebugLog: () => undefined,
  readFromLog: () => [],
  useLog: () => ({ logs: [], clearLogs: () => undefined }),
  LogProvider: ({ children }: { children: unknown }) => children,
  default: jest.requireActual("jotai").atom([]),
}));
// The custom-header barrel touches MMKV and SecureStore; the shared double
// keeps the pure helpers real.
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);

// Android: the platform whose native chrome reads the flag.
stubReactNative({ OS: "android", isTV: false });

// Required after the platform is set, not imported: settings.ts reads
// Platform once, when the module is evaluated.
const { buildNativePlayerConfig, buildNativePlayerStrings } =
  require("./buildNativePlayerConfig") as typeof import("./buildNativePlayerConfig");
const { defaultValues } =
  require("@/utils/atoms/settings") as typeof import("@/utils/atoms/settings");

const strings = buildNativePlayerStrings(
  ((key: string) => key) as unknown as TFunction,
);

// What a tuner gives for a channel: a transport stream with no end, opened
// for this play and closed with it.
const liveSource = {
  Id: "live-1",
  Name: "Channel",
  Path: "http://tuner/stream.ts",
  Protocol: "Http",
  Container: "ts",
  IsInfiniteStream: true,
  LiveStreamId: "live-stream-1",
  SupportsDirectStream: true,
  MediaStreams: [{ Type: "Video", Index: 0, Width: 1920, Height: 1080 }],
};

const fileSource = {
  Id: "ms-1",
  Name: "Direct",
  Path: "/media/movie.mkv",
  Protocol: "File",
  Container: "mkv",
  MediaStreams: [{ Type: "Video", Index: 0, Width: 1920, Height: 1080 }],
};

const build = (
  item: Record<string, unknown>,
  playbackInfo: { itemId: string; source: Record<string, unknown> },
  mediaSourceId?: string,
) => {
  const api = makeApi();
  api.mock
    .onGet(new RegExp(`/Items/${item.Id}\\?userId=user-1$`))
    .reply(200, item);
  // A program's negotiation carries its options in the query.
  api.mock
    .onPost(new RegExp(`/Items/${playbackInfo.itemId}/PlaybackInfo(\\?.*)?$`))
    .reply(200, {
      PlaySessionId: "session-1",
      MediaSources: [playbackInfo.source],
    });
  return buildNativePlayerConfig({
    api,
    userId: "user-1",
    settings: defaultValues,
    req: { itemId: String(item.Id), offline: false, mediaSourceId },
    getDownloadedItemById: () => undefined,
    strings,
    originalLabel: "Original",
  });
};

// The native chrome never sees the item, only this flag. Without it a channel
// opened as a film: a bar over the few seconds read so far, an end time, and
// seeks offered on screen, to a headset and on the lock screen.
describe("a Live TV stream is marked live", () => {
  test("a channel", async () => {
    const result = await build(
      { Id: "channel-1", Type: "TvChannel", Name: "A Channel" },
      { itemId: "channel-1", source: liveSource },
    );
    expect(result?.config.stream.isLive).toBe(true);
  });

  // A program negotiates and plays the channel it airs on.
  test("a program", async () => {
    const result = await build(
      {
        Id: "program-1",
        Type: "Program",
        Name: "A Program",
        ChannelId: "channel-1",
      },
      { itemId: "channel-1", source: liveSource },
    );
    expect(result?.config.stream.isLive).toBe(true);
  });

  test("a movie is not", async () => {
    const result = await build(
      { Id: "movie-1", Type: "Movie", Name: "A Movie" },
      { itemId: "movie-1", source: fileSource },
    );
    expect(result?.config.stream.isLive).toBe(false);
  });
});

// A channel's page plays the channel's own source, which the server does not
// take (see getStreamUrl). A quality or track change renegotiates naming the
// session's source: the live stream opened for this play, which the server
// shares, not the channel, which would open another on the tuner.
test("a channel played from its page keeps the live stream it opened", async () => {
  const result = await build(
    { Id: "channel-1", Type: "TvChannel", Name: "A Channel" },
    { itemId: "channel-1", source: liveSource },
    "channel-1",
  );
  expect(result?.seed.mediaSourceId).toBe("live-1");
});

test("the chrome gets the label of its LIVE badge", () => {
  expect(strings.live).toBe("player.live");
});
