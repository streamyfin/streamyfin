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
// getStreamUrl negotiates over HTTP; the warm only needs its MediaSources.
jest.mock("@/utils/jellyfin/media/getStreamUrl", () => ({
  getStreamUrl: jest.fn(),
}));

const { getStreamUrl } = jest.requireMock(
  "@/utils/jellyfin/media/getStreamUrl",
) as typeof import("@/utils/jellyfin/media/getStreamUrl");
const { warmUpcomingSubtitles } =
  require("./warmUpcomingSubtitles") as typeof import("./warmUpcomingSubtitles");

const item = {
  Id: "next-1",
  Type: "Episode",
  Name: "Next",
} as unknown as BaseItemDto;
const api = { basePath: "https://jf.example" } as unknown as Api;
// The real profile builder, exactly what the swap's negotiation passes.
const deviceProfile = generateDeviceProfile({ player: "mpv" });

const mediaSourceWithExternalSub = (): MediaSourceInfo =>
  ({
    MediaStreams: [
      { Type: "Video", Index: 0 },
      {
        Type: "Subtitle",
        DeliveryMethod: "External",
        Index: 3,
        Codec: "srt",
        DeliveryUrl: "/Videos/next-1/1/Subtitles/3/0/Stream.srt",
      },
    ],
  }) as MediaSourceInfo;

beforeEach(() => {
  fakeFiles.clear();
  jest.mocked(getStreamUrl).mockReset();
});

test("negotiates the item and prefetches its subtitles into the cache", async () => {
  jest.mocked(getStreamUrl).mockResolvedValue({
    url: "https://jf.example/Videos/next-1/stream",
    sessionId: "session-1",
    mediaSource: mediaSourceWithExternalSub(),
  } as Awaited<ReturnType<typeof getStreamUrl>>);

  await warmUpcomingSubtitles({ api, item, deviceProfile });

  expect(jest.mocked(getStreamUrl).mock.calls[0]?.[0]?.deviceProfile).toBe(
    deviceProfile,
  );
  // The download lands on the .part staging name and is moved into place.
  expect(fakeFiles.downloads()).toEqual([
    {
      url: "https://jf.example/Videos/next-1/1/Subtitles/3/0/Stream.srt",
      destination: `${CACHE}/subtitles/next-1-3.srt.part`,
    },
  ]);
  expect(fakeFiles.remaining()).toContain(`${CACHE}/subtitles/next-1-3.srt`);
});

test("a failed negotiation is swallowed — the warm is best effort", async () => {
  jest
    .mocked(getStreamUrl)
    .mockRejectedValue(new Error("PlaybackInfo returned no media source"));

  await expect(
    warmUpcomingSubtitles({ api, item, deviceProfile }),
  ).resolves.toBeUndefined();
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
