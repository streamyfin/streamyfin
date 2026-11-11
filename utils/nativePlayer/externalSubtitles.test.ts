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
// The log module reaches Sentry and MMKV; the prefetch only writes its summary.
jest.mock("@/utils/log", () => ({ writeInfoLog: jest.fn() }));

const { File } = jest.requireActual("@/test-utils/fileSystem")
  .fileSystemModule as typeof import("@/test-utils/fileSystem")["fileSystemModule"];
const {
  clearSubtitlePrefetchCache,
  localSubtitleFileName,
  prefetchExternalSubtitles,
} = require("./externalSubtitles") as typeof import("./externalSubtitles");
const { writeInfoLog }: { writeInfoLog: jest.Mock } =
  jest.requireMock("@/utils/log");

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
const MEDIA_SOURCE_ID = "ms-1";

// Staging names carry an attempt-unique suffix: an abandoned transfer keeps
// writing its `.part` after the timeout, so attempts never share a path.
const isStagingOf = (path: string) =>
  path.startsWith(`${FINAL_URI}.`) && path.endsWith(".part");

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
  ({
    Id: MEDIA_SOURCE_ID,
    MediaStreams: [{ Type: "Video", Index: 0 }, ...subs],
  }) as MediaSourceInfo;

const streamsOf = (mediaSource: MediaSourceInfo): MediaStream[] =>
  mediaSource.MediaStreams as MediaStream[];

// The cache name of the default sidecar on this server, as the prefetch builds it.
const FINAL_URI = `${CACHE}/subtitles/${localSubtitleFileName(
  item,
  MEDIA_SOURCE_ID,
  externalSub(),
  REMOTE_URL,
  api.basePath,
)}`;

beforeEach(() => {
  fakeFiles.clear();
  writeInfoLog.mockClear();
});

// A spy left in place would answer the next test's downloads too.
afterEach(() => {
  jest.restoreAllMocks();
});

test("downloads the subtitle into the cache and points DeliveryUrl at it", async () => {
  const mediaSource = mediaSourceWith([externalSub()]);

  await prefetchExternalSubtitles({ mediaSource, item, api });

  // The download lands on an attempt-unique .part staging name and is moved
  // into place.
  expect(fakeFiles.downloads()).toHaveLength(1);
  expect(fakeFiles.downloads()[0]!.url).toBe(REMOTE_URL);
  expect(isStagingOf(fakeFiles.downloads()[0]!.destination)).toBe(true);
  expect(streamsOf(mediaSource)[1]!.DeliveryUrl).toBe(FINAL_URI);
  expect(fakeFiles.remaining()).toContain(FINAL_URI);
  // The .part staging file never survives a completed download.
  expect(fakeFiles.remaining().some(isStagingOf)).toBe(false);
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
  // Neither the final file nor any .part staging file may be left behind.
  // (The cache directory itself stays, as it would on disk.)
  expect(fakeFiles.remaining()).not.toContain(FINAL_URI);
  expect(fakeFiles.remaining().some(isStagingOf)).toBe(false);
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

test("a concurrent prefetch awaits the in-flight download instead of duplicating it", async () => {
  // The next-episode warm and the swap both call this for the same file. A
  // second native download to the same .part name rejects, and its catch
  // deletes the staging file the first one is moving — the subtitle is lost.
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const destinations: string[] = [];
  const impl = (_url: string, destination: { uri: string }) => {
    destinations.push(destination.uri);
    return gate.then(() => destination);
  };
  jest
    .spyOn(File, "downloadFileAsync")
    .mockImplementation(impl as unknown as typeof File.downloadFileAsync);
  const mediaSource = mediaSourceWith([externalSub()]);

  const first = prefetchExternalSubtitles({ mediaSource, item, api });
  await Promise.resolve();
  const second = prefetchExternalSubtitles({ mediaSource, item, api });
  await Promise.resolve();
  await Promise.resolve();

  expect(destinations).toHaveLength(1);
  expect(isStagingOf(destinations[0]!)).toBe(true);

  release();
  await Promise.all([first, second]);
  expect(streamsOf(mediaSource)[1]!.DeliveryUrl).toBe(FINAL_URI);
  expect(fakeFiles.remaining()).toContain(FINAL_URI);
});

describe("localSubtitleFileName", () => {
  test("keeps the extension the server URL carries", () => {
    expect(
      localSubtitleFileName(item, MEDIA_SOURCE_ID, externalSub(), REMOTE_URL),
    ).toMatch(/^item-1-ms-1-3-[0-9a-f]{8}\.srt$/);
  });

  test("an extensionless URL falls back to the stream's codec", () => {
    expect(
      localSubtitleFileName(
        item,
        MEDIA_SOURCE_ID,
        externalSub({ Codec: "vtt" }),
        "https://subs.example/3/Stream",
      ),
    ).toMatch(/^item-1-ms-1-3-[0-9a-f]{8}\.vtt$/);
  });

  test("the subrip codec name becomes the srt extension", () => {
    expect(
      localSubtitleFileName(
        item,
        MEDIA_SOURCE_ID,
        externalSub({ Codec: "subrip" }),
        "https://subs.example/3/Stream",
      ),
    ).toMatch(/^item-1-ms-1-3-[0-9a-f]{8}\.srt$/);
  });

  test("two versions of one item get different files", () => {
    expect(
      localSubtitleFileName(item, "ms-1", externalSub(), REMOTE_URL),
    ).not.toBe(localSubtitleFileName(item, "ms-2", externalSub(), REMOTE_URL));
  });

  test("neither extension nor codec names a format → srt", () => {
    expect(
      localSubtitleFileName(
        item,
        MEDIA_SOURCE_ID,
        externalSub(),
        "https://subs.example/3",
      ),
    ).toMatch(/^item-1-ms-1-3-[0-9a-f]{8}\.srt$/);
  });
});

test("a restarted app never reuses a staging name, even in the same millisecond", () => {
  // A transfer an earlier run abandoned can still be writing its `.part`, so the
  // next run must stage somewhere else. A per-process counter would start over
  // after a restart and hand out the same name again.
  const now = jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
  let draws = 0;
  const random = jest
    .spyOn(Math, "random")
    .mockImplementation(() => ++draws / 10);
  // Each call loads a fresh copy of the module, as a new process would.
  const nameAfterRestart = (): string => {
    let name = "";
    jest.isolateModules(() => {
      name = (
        require("./externalSubtitles") as typeof import("./externalSubtitles")
      ).stagingName("item-1-ms-1-3.srt");
    });
    return name;
  };

  try {
    const first = nameAfterRestart();
    const second = nameAfterRestart();

    expect(first).toMatch(/^item-1-ms-1-3\.srt\..+\.part$/);
    expect(second).not.toBe(first);
  } finally {
    now.mockRestore();
    random.mockRestore();
  }
});

test("keeps the session's subtitle remote when the budget misses it", async () => {
  // Left without a URL it would vanish for the whole session, then be carried
  // as a deliberate off; remote, the engine fetches it as it did before.
  jest
    .spyOn(File, "downloadFileAsync")
    .mockRejectedValue(new Error("extraction still running"));
  const mediaSource = mediaSourceWith([
    externalSub(),
    externalSub({ Index: 4, DeliveryUrl: "/Videos/item-1/4/0/Stream.vtt" }),
  ]);

  await prefetchExternalSubtitles({
    mediaSource,
    item,
    api,
    preferredIndex: 4,
  });

  const [other, preferred] = streamsOf(mediaSource).slice(1);
  expect(preferred!.DeliveryUrl).toBe("/Videos/item-1/4/0/Stream.vtt");
  expect(other!.DeliveryUrl).toBeUndefined();
});

test("logs what the engine reads from disk, fetches itself and goes without", async () => {
  jest
    .spyOn(File, "downloadFileAsync")
    .mockRejectedValueOnce(new Error("extraction still running"));
  const mediaSource = mediaSourceWith([
    externalSub({ Index: 4, DeliveryUrl: "/Videos/item-1/4/0/Stream.vtt" }),
    externalSub(),
    externalSub({ Index: 5, DeliveryUrl: "/Videos/item-1/5/0/Stream.ass" }),
  ]);

  await prefetchExternalSubtitles({
    mediaSource,
    item,
    api,
    preferredIndex: 4,
    budgetMs: 60_000,
  });

  // Only the first download, the session's subtitle, is refused: it stays
  // remote for the engine, and the two others land on disk.
  expect(writeInfoLog).toHaveBeenCalledTimes(1);
  expect(writeInfoLog.mock.calls[0]?.[0]).toMatch(
    /^Subtitle prefetch: 2 of 3 on disk in \d+ ms$/,
  );
  expect(writeInfoLog.mock.calls[0]?.[1]).toEqual({
    itemId: "item-1",
    onDisk: [3, 5],
    keptRemote: [4],
    leftOut: [],
  });
});

test("fetches the session's subtitle before the others", async () => {
  const mediaSource = mediaSourceWith([
    externalSub(),
    externalSub({ Index: 4, DeliveryUrl: "/Videos/item-1/4/0/Stream.vtt" }),
  ]);

  await prefetchExternalSubtitles({
    mediaSource,
    item,
    api,
    preferredIndex: 4,
  });

  expect(fakeFiles.downloads().map((d) => d.url)).toEqual([
    "https://jf.example/Videos/item-1/4/0/Stream.vtt",
    REMOTE_URL,
  ]);
});

test("cancels the native transfer of a subtitle whose time ran out", async () => {
  // Left running, it competes with the next subtitle's request, and
  // concurrent requests corrupt Jellyfin's first extraction.
  const signals: AbortSignal[] = [];
  const impl = (
    _url: string,
    _to: unknown,
    options?: { signal?: AbortSignal },
  ) => {
    if (options?.signal) signals.push(options.signal);
    return new Promise(() => undefined);
  };
  jest
    .spyOn(File, "downloadFileAsync")
    .mockImplementation(impl as unknown as typeof File.downloadFileAsync);
  const mediaSource = mediaSourceWith([externalSub()]);

  await prefetchExternalSubtitles({
    mediaSource,
    item,
    api,
    budgetMs: 60_000,
    perSubtitleMs: 0,
  });

  expect(signals).toHaveLength(1);
  expect(signals[0]!.aborted).toBe(true);
});

test("never names another track's file after an index shift, nor another server's", () => {
  // Jellyfin numbers sidecars first: adding one moves the French row onto the
  // index the German one had.
  const german = externalSub({ Language: "ger" });
  const french = externalSub({ Language: "fre" });
  expect(
    localSubtitleFileName(
      item,
      MEDIA_SOURCE_ID,
      french,
      REMOTE_URL,
      api.basePath,
    ),
  ).not.toBe(
    localSubtitleFileName(
      item,
      MEDIA_SOURCE_ID,
      german,
      REMOTE_URL,
      api.basePath,
    ),
  );
  expect(
    localSubtitleFileName(
      item,
      MEDIA_SOURCE_ID,
      german,
      REMOTE_URL,
      "https://a.example",
    ),
  ).not.toBe(
    localSubtitleFileName(
      item,
      MEDIA_SOURCE_ID,
      german,
      REMOTE_URL,
      "https://b.example",
    ),
  );
});

test("a new player's cache clear empties the folder, so a re-synced sidecar is fetched again", async () => {
  fakeFiles.add(`${CACHE}/subtitles`, FINAL_URI);

  clearSubtitlePrefetchCache();
  await prefetchExternalSubtitles({
    mediaSource: mediaSourceWith([externalSub()]),
    item,
    api,
  });

  expect(fakeFiles.downloads().map((d) => d.url)).toEqual([REMOTE_URL]);
});

test("a caller whose wait spent its budget starts no download of its own", async () => {
  // The first caller's transfer hangs until it is cancelled.
  // The real download takes the options the prefetch passes; the double's
  // signature leaves them out.
  const hangUntilCancelled = (
    _url: string,
    _destination: unknown,
    options?: { signal?: AbortSignal },
  ) =>
    new Promise<never>((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () =>
        reject(new Error("cancelled")),
      );
    });
  const download = jest
    .spyOn(File, "downloadFileAsync")
    .mockImplementation(hangUntilCancelled as never);

  await Promise.all([
    prefetchExternalSubtitles({
      mediaSource: mediaSourceWith([externalSub()]),
      item,
      api,
      budgetMs: 200,
      perSubtitleMs: 200,
    }),
    prefetchExternalSubtitles({
      mediaSource: mediaSourceWith([externalSub()]),
      item,
      api,
      budgetMs: 20,
      perSubtitleMs: 20,
    }),
  ]);

  // A second request beside the running one is what corrupts Jellyfin's first
  // extraction.
  expect(download).toHaveBeenCalledTimes(1);
});

test("a time-out during the move never deletes the moved file", async () => {
  // expo-file-system 58 repoints a File at its destination once its move
  // succeeds; the cleanup has to go through the staging path.
  const realMove = File.prototype.move;
  jest.spyOn(File.prototype, "move").mockImplementation(function (
    this: { location: string },
    destination,
  ) {
    realMove.call(this, destination);
    this.location = (destination as { uri: string }).uri;
    return new Promise((resolve) => setTimeout(resolve, 80)) as never;
  });

  await prefetchExternalSubtitles({
    mediaSource: mediaSourceWith([externalSub()]),
    item,
    api,
    budgetMs: 40,
    perSubtitleMs: 40,
  });

  expect(fakeFiles.remaining()).toContain(FINAL_URI);
});
