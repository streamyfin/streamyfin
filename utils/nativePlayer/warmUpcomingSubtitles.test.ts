import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { CACHE, fakeFiles } from "@/test-utils/fileSystem";
import { generateDeviceProfile } from "@/utils/profiles/native";

jest.mock(
  "expo-file-system",
  () => jest.requireActual("@/test-utils/fileSystem").fileSystemModule,
);
// The custom-header barrel touches MMKV and SecureStore; the shared double
// keeps the pure helpers real.
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);
// The log module reaches Sentry and MMKV; the prefetch only writes its summary.
jest.mock("@/utils/log", () => ({ writeInfoLog: jest.fn() }));
// getStreamUrl negotiates over HTTP; the warm only needs its MediaSources.
jest.mock("@/utils/jellyfin/media/getStreamUrl", () => ({
  getStreamUrl: jest.fn(),
}));

const { getStreamUrl } = jest.requireMock(
  "@/utils/jellyfin/media/getStreamUrl",
) as typeof import("@/utils/jellyfin/media/getStreamUrl");
const { warmUpcomingSubtitles } =
  require("./warmUpcomingSubtitles") as typeof import("./warmUpcomingSubtitles");
const { localSubtitleFileName } =
  require("./externalSubtitles") as typeof import("./externalSubtitles");

const item = {
  Id: "next-1",
  Type: "Episode",
  Name: "Next",
} as unknown as BaseItemDto;
const api = { basePath: "https://jf.example" } as unknown as Api;
// The real profile builder, exactly what the swap's negotiation passes.
const deviceProfile = generateDeviceProfile({ player: "mpv" });

const sidecar = (index: number, language: string) => ({
  Type: "Subtitle" as const,
  DeliveryMethod: "External" as const,
  Index: index,
  Codec: "srt",
  Language: language,
  DeliveryUrl: `/Videos/next-1/1/Subtitles/${index}/0/Stream.srt`,
});

const mediaSourceWithExternalSub = (): MediaSourceInfo =>
  ({
    Id: "ms-1",
    MediaStreams: [{ Type: "Video", Index: 0 }, sidecar(3, "fre")],
  }) as MediaSourceInfo;

/** Where the prefetch caches a sidecar of `ms-1`, named before it rewrites it. */
const cachedPath = (sub: ReturnType<typeof sidecar>) =>
  `${CACHE}/subtitles/${localSubtitleFileName(
    item,
    "ms-1",
    sub,
    `https://jf.example${sub.DeliveryUrl}`,
    api.basePath,
  )}`;

beforeEach(() => {
  fakeFiles.clear();
  jest.mocked(getStreamUrl).mockReset();
});

// A download spy left in place would answer the next test's downloads too.
afterEach(() => {
  jest.restoreAllMocks();
});

test("negotiates the item and prefetches its subtitles into the cache", async () => {
  jest.mocked(getStreamUrl).mockResolvedValue({
    url: "https://jf.example/Videos/next-1/stream",
    sessionId: "session-1",
    mediaSource: mediaSourceWithExternalSub(),
  } as Awaited<ReturnType<typeof getStreamUrl>>);

  await expect(
    warmUpcomingSubtitles({
      api,
      item,
      deviceProfile,
      mediaSourceId: "ms-1",
    }),
  ).resolves.toBe(true);

  const negotiated = jest.mocked(getStreamUrl).mock.calls[0]?.[0];
  expect(negotiated?.deviceProfile).toBe(deviceProfile);
  // Nothing plays this negotiation: a source that needs opening would be
  // opened and never closed.
  expect(negotiated?.autoOpenLiveStream).toBe(false);
  // The version the swap would pick, so both negotiations land on the same
  // source and the warm warms the right subtitles.
  expect(negotiated?.mediaSourceId).toBe("ms-1");
  // The download lands on an attempt-unique .part staging name and is moved
  // into place.
  expect(fakeFiles.downloads()).toHaveLength(1);
  expect(fakeFiles.downloads()[0]!.url).toBe(
    "https://jf.example/Videos/next-1/1/Subtitles/3/0/Stream.srt",
  );
  const cached = cachedPath(sidecar(3, "fre"));
  expect(fakeFiles.downloads()[0]!.destination.startsWith(`${cached}.`)).toBe(
    true,
  );
  expect(fakeFiles.remaining()).toContain(cached);
});

test("negotiates with the tracks and the bitrate cap the swap will carry", async () => {
  jest.mocked(getStreamUrl).mockResolvedValue({
    url: "https://jf.example/Videos/next-1/stream",
    sessionId: "session-1",
    mediaSource: mediaSourceWithExternalSub(),
  } as Awaited<ReturnType<typeof getStreamUrl>>);

  await warmUpcomingSubtitles({
    api,
    item,
    deviceProfile,
    mediaSourceId: "ms-1",
    audioStreamIndex: 2,
    subtitleStreamIndex: 3,
    maxStreamingBitrate: 8_000_000,
  });

  // The sidecars Jellyfin answers with depend on these, so a warm that left
  // them out could cache files the swap never asks for.
  expect(jest.mocked(getStreamUrl).mock.calls[0]?.[0]).toMatchObject({
    mediaSourceId: "ms-1",
    audioStreamIndex: 2,
    subtitleStreamIndex: 3,
    maxStreamingBitrate: 8_000_000,
  });
});

test("fetches the subtitle the swap will show first", async () => {
  jest.mocked(getStreamUrl).mockResolvedValue({
    url: "https://jf.example/Videos/next-1/stream",
    sessionId: "session-1",
    mediaSource: {
      Id: "ms-1",
      MediaStreams: [
        { Type: "Video", Index: 0 },
        sidecar(2, "eng"),
        sidecar(3, "fre"),
      ],
    } as MediaSourceInfo,
  } as Awaited<ReturnType<typeof getStreamUrl>>);

  await warmUpcomingSubtitles({
    api,
    item,
    deviceProfile,
    mediaSourceId: "ms-1",
    subtitleStreamIndex: 3,
  });

  expect(fakeFiles.downloads().map((download) => download.url)).toEqual([
    "https://jf.example/Videos/next-1/1/Subtitles/3/0/Stream.srt",
    "https://jf.example/Videos/next-1/1/Subtitles/2/0/Stream.srt",
  ]);
});

test("a failed negotiation is swallowed — the warm is best effort", async () => {
  jest
    .mocked(getStreamUrl)
    .mockRejectedValue(new Error("PlaybackInfo returned no media source"));

  await expect(
    warmUpcomingSubtitles({ api, item, deviceProfile }),
  ).resolves.toBe(false);
  expect(fakeFiles.downloads()).toEqual([]);
});

test("no media source in the answer prefetches nothing", async () => {
  jest.mocked(getStreamUrl).mockResolvedValue({
    url: null,
    sessionId: null,
    mediaSource: undefined,
  } as Awaited<ReturnType<typeof getStreamUrl>>);

  await warmUpcomingSubtitles({ api, item, deviceProfile });

  expect(fakeFiles.downloads()).toEqual([]);
});

test("an item without an id never negotiates", async () => {
  await warmUpcomingSubtitles({
    api,
    item: { Type: "Episode" } as BaseItemDto,
    deviceProfile,
  });

  expect(jest.mocked(getStreamUrl)).not.toHaveBeenCalled();
});

test("resolves false when a sidecar is still off disk, so the warm is tried again", async () => {
  jest.mocked(getStreamUrl).mockResolvedValue({
    url: "https://jf.example/Videos/next-1/stream",
    sessionId: "session-1",
    mediaSource: mediaSourceWithExternalSub(),
  } as Awaited<ReturnType<typeof getStreamUrl>>);
  jest
    .spyOn(
      jest.requireActual("@/test-utils/fileSystem").fileSystemModule.File,
      "downloadFileAsync",
    )
    .mockRejectedValueOnce(new Error("extraction still running"));

  await expect(
    warmUpcomingSubtitles({ api, item, deviceProfile, mediaSourceId: "ms-1" }),
  ).resolves.toBe(false);
});
