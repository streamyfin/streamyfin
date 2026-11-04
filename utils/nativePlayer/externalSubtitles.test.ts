import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client";
import { CACHE, fakeFiles } from "@/test-utils/fileSystem";

jest.mock(
  "expo-file-system",
  () => jest.requireActual("@/test-utils/fileSystem").fileSystemModule,
);
// The custom-header barrel touches MMKV and SecureStore; the shared double
// keeps the pure helpers real.
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);

const { File } = jest.requireActual("@/test-utils/fileSystem")
  .fileSystemModule as typeof import("@/test-utils/fileSystem")["fileSystemModule"];
const { localSubtitleFileName, prefetchExternalSubtitles } =
  require("./externalSubtitles") as typeof import("./externalSubtitles");

const item = {
  Id: "item-1",
  Type: "Episode",
  Name: "Pilot",
} as unknown as BaseItemDto;
const api = {
  basePath: "https://jf.example",
  accessToken: "token",
} as unknown as Api;

const REMOTE_URL =
  "https://jf.example/Videos/item-1/88794ff6/Subtitles/3/0/Stream.srt?ApiKey=k";
const FINAL_URI = `${CACHE}/subtitles/item-1-3.srt`;

const externalSub = (over: Partial<MediaStream> = {}): MediaStream =>
  ({
    Type: "Subtitle",
    DeliveryMethod: "External",
    Index: 3,
    Codec: "srt",
    DeliveryUrl: "/Videos/item-1/88794ff6/Subtitles/3/0/Stream.srt?ApiKey=k",
    ...over,
  }) as unknown as MediaStream;

const mediaSourceWith = (subs: MediaStream[]): MediaSourceInfo =>
  ({ MediaStreams: [{ Type: "Video", Index: 0 }, ...subs] }) as MediaSourceInfo;

const streamsOf = (mediaSource: MediaSourceInfo): MediaStream[] =>
  mediaSource.MediaStreams as MediaStream[];

beforeEach(() => {
  fakeFiles.clear();
});

test("downloads the subtitle into the cache and points DeliveryUrl at it", async () => {
  const mediaSource = mediaSourceWith([externalSub()]);

  await prefetchExternalSubtitles({ mediaSource, item, api });

  // The download lands on the .part staging name and is moved into place.
  expect(fakeFiles.downloads()).toEqual([
    { url: REMOTE_URL, destination: `${FINAL_URI}.part` },
  ]);
  expect(streamsOf(mediaSource)[1]!.DeliveryUrl).toBe(FINAL_URI);
  expect(fakeFiles.remaining()).toContain(FINAL_URI);
  // The .part staging file never survives a completed download.
  expect(fakeFiles.remaining()).not.toContain(`${FINAL_URI}.part`);
});

test("reuses an existing cache file without a download", async () => {
  fakeFiles.add(FINAL_URI);
  const mediaSource = mediaSourceWith([externalSub()]);

  await prefetchExternalSubtitles({ mediaSource, item, api });

  expect(fakeFiles.downloads()).toEqual([]);
  expect(streamsOf(mediaSource)[1]!.DeliveryUrl).toBe(FINAL_URI);
});

test("undelivers a subtitle whose download fails and cleans the part file", async () => {
  jest
    .spyOn(File, "downloadFileAsync")
    .mockRejectedValueOnce(new Error("wedged path"));
  const mediaSource = mediaSourceWith([externalSub()]);

  await prefetchExternalSubtitles({ mediaSource, item, api });

  expect(streamsOf(mediaSource)[1]!.DeliveryUrl).toBeUndefined();
  // Neither the final file nor the .part staging file may be left behind.
  // (The cache directory itself stays, as it would on disk.)
  expect(fakeFiles.remaining()).not.toContain(FINAL_URI);
  expect(fakeFiles.remaining()).not.toContain(`${FINAL_URI}.part`);
});

test("undelivers every remote subtitle once the budget is spent", async () => {
  const mediaSource = mediaSourceWith([
    externalSub(),
    externalSub({ Index: 4, DeliveryUrl: "/Videos/item-1/4/0/Stream.vtt" }),
  ]);

  await prefetchExternalSubtitles({ mediaSource, item, api, budgetMs: 0 });

  expect(fakeFiles.downloads()).toEqual([]);
  const [first, second] = streamsOf(mediaSource).slice(1);
  expect(first!.DeliveryUrl).toBeUndefined();
  expect(second!.DeliveryUrl).toBeUndefined();
});

test("one wedged subtitle cannot spend the whole budget: the per-subtitle cap applies", async () => {
  // The download never settles, so only the per-subtitle timeout can end it.
  // Without the cap this download would run to the full budget and the
  // subtitle after it would get nothing.
  jest
    .spyOn(File, "downloadFileAsync")
    .mockReturnValue(new Promise(() => undefined));
  const mediaSource = mediaSourceWith([externalSub()]);

  await prefetchExternalSubtitles({
    mediaSource,
    item,
    api,
    budgetMs: 60_000,
    perSubtitleMs: 0,
  });

  expect(streamsOf(mediaSource)[1]!.DeliveryUrl).toBeUndefined();
  expect(fakeFiles.remaining()).not.toContain(FINAL_URI);
});

test("keeps an already-local DeliveryUrl untouched", async () => {
  const mediaSource = mediaSourceWith([
    externalSub({ IsExternalUrl: true, DeliveryUrl: "file:///subs/x.srt" }),
  ]);

  await prefetchExternalSubtitles({ mediaSource, item, api });

  expect(fakeFiles.downloads()).toEqual([]);
  expect(streamsOf(mediaSource)[1]!.DeliveryUrl).toBe("file:///subs/x.srt");
});

test("does nothing when the media source has no external subtitles", async () => {
  const mediaSource = mediaSourceWith([]);

  await prefetchExternalSubtitles({ mediaSource, item, api });

  expect(fakeFiles.downloads()).toEqual([]);
});

describe("localSubtitleFileName", () => {
  test("keeps the extension the server URL carries", () => {
    expect(localSubtitleFileName(item, externalSub(), `${REMOTE_URL}`)).toBe(
      "item-1-3.srt",
    );
  });

  test("an extensionless URL falls back to the stream's codec", () => {
    expect(
      localSubtitleFileName(
        item,
        externalSub({ Codec: "vtt" }),
        "https://subs.example/3/Stream",
      ),
    ).toBe("item-1-3.vtt");
  });

  test("the subrip codec name becomes the srt extension", () => {
    expect(
      localSubtitleFileName(
        item,
        externalSub({ Codec: "subrip" }),
        "https://subs.example/3/Stream",
      ),
    ).toBe("item-1-3.srt");
  });

  test("neither extension nor codec names a format → srt", () => {
    expect(
      localSubtitleFileName(item, externalSub(), "https://subs.example/3"),
    ).toBe("item-1-3.srt");
  });
});
