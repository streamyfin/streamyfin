import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { ExternalPlayerMode } from "@/constants/ExternalPlayer";
import {
  buildExternalPlayerLaunchParams,
  buildExternalPlayerSubtitleExtras,
  getExternalPlayerSubtitles,
  getExternalPlayerUri,
  isExternalPlayerEnabled,
  readExternalPlayerResult,
  shouldUseExternalPlayer,
} from "./externalPlayer";

const mockExisting = new Set<string>();
let mockDownloaded: Record<string, Record<string, unknown>> = {};

jest.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    constructor(location: string) {
      this.uri = location;
    }
    get exists() {
      return mockExisting.has(this.uri);
    }
    get contentUri() {
      return this.uri.replace("file:///", "content://provider/");
    }
  },
}));
jest.mock("@/providers/Downloads/database", () => ({
  getDownloadedItemById: (id: string) => mockDownloaded[id],
}));

const online = { itemId: "item-1", offline: false };
const offline = { itemId: "item-1", offline: true };

describe("isExternalPlayerEnabled", () => {
  it.each([
    ["off", false],
    ["askOnLongPress", true],
    ["ask", true],
    ["external", true],
    // The plugin can push a mode this build does not know, or an older one.
    ["all", false],
    [undefined, false],
  ])("is %s -> %s", (mode, expected) => {
    expect(isExternalPlayerEnabled(mode as ExternalPlayerMode)).toBe(expected);
  });
});

describe("shouldUseExternalPlayer", () => {
  const movie = { Type: "Movie" } as const;

  it.each([
    ["off", undefined, false],
    ["askOnLongPress", undefined, false],
    ["ask", undefined, false],
    ["external", undefined, true],
    ["askOnLongPress", true, true],
    ["ask", true, true],
    ["external", false, false],
  ] as const)("mode %s, picked %p: external %p", (mode, picked, expected) => {
    expect(shouldUseExternalPlayer(mode, movie, picked)).toBe(expected);
  });

  // The sheet only offers another app while one is on; the setting wins.
  it("keeps a pick of another app in Streamyfin while the setting is off", () => {
    expect(shouldUseExternalPlayer("off", movie, true)).toBe(false);
  });

  it("keeps Live TV in the app, which has to close the live stream", () => {
    expect(shouldUseExternalPlayer("external", { Type: "TvChannel" })).toBe(
      false,
    );
    expect(shouldUseExternalPlayer("external", { Type: "Program" }, true)).toBe(
      false,
    );
  });

  it("plays a mode it does not know, or none, in the app", () => {
    expect(shouldUseExternalPlayer(undefined, movie)).toBe(false);
    expect(shouldUseExternalPlayer("bogus" as never, movie)).toBe(false);
  });
});

describe("getExternalPlayerUri", () => {
  const api = {
    basePath: "https://jf.example",
    accessToken: "token",
  } as Api;

  beforeEach(() => {
    mockExisting.clear();
    mockDownloaded = {};
  });

  it("hands over a downloaded file as a content URI", () => {
    mockDownloaded["item-1"] = { videoFilePath: "/data/files/movie.mkv" };
    mockExisting.add("file:///data/files/movie.mkv");
    expect(getExternalPlayerUri(api, offline)).toBe(
      "content://provider/data/files/movie.mkv",
    );
  });

  it("has nothing to hand over when the downloaded file is gone", () => {
    mockDownloaded["item-1"] = { videoFilePath: "/data/files/movie.mkv" };
    expect(getExternalPlayerUri(api, offline)).toBeNull();
    expect(getExternalPlayerUri(api, { ...offline, itemId: "other" })).toBe(
      null,
    );
  });

  it("streams an online item as the original file, never a transcode", () => {
    const uri = new URL(
      getExternalPlayerUri(api, { ...online, mediaSourceId: "source-1" })!,
    );
    expect(uri.origin + uri.pathname).toBe(
      "https://jf.example/Videos/item-1/stream",
    );
    expect(uri.searchParams.get("static")).toBe("true");
    expect(uri.searchParams.get("ApiKey")).toBe("token");
    expect(uri.searchParams.get("mediaSourceId")).toBe("source-1");
  });

  it("has nothing to hand over online without a signed in api", () => {
    expect(getExternalPlayerUri(null, online)).toBeNull();
  });
});

describe("getExternalPlayerSubtitles", () => {
  const api = {
    basePath: "https://jf.example",
    accessToken: "token",
  } as Api;
  const srt = (source: string, index: number) =>
    `https://jf.example/Videos/item-1/${source}/Subtitles/${index}/Stream.srt?ApiKey=token`;
  const item: BaseItemDto = {
    MediaSources: [
      {
        Id: "source-1",
        DefaultSubtitleStreamIndex: 3,
        MediaStreams: [
          { Type: "Video", Index: 0 },
          { Type: "Subtitle", Index: 2, IsTextSubtitleStream: true },
          { Type: "Subtitle", Index: 3, IsTextSubtitleStream: true },
          { Type: "Subtitle", Index: 4, IsTextSubtitleStream: false },
          // No index, so no route to ask the server for it by.
          { Type: "Subtitle", IsTextSubtitleStream: true },
        ],
      },
      {
        Id: "source-2",
        MediaStreams: [
          { Type: "Subtitle", Index: 5, IsTextSubtitleStream: true },
        ],
      },
    ],
  };

  beforeEach(() => {
    mockExisting.clear();
    mockDownloaded = {};
  });

  // A Chromecast shows no subtitle from inside the file: BubbleUPnP needs them
  // all as files, embedded ones included. Image subtitles cannot be text.
  it("hands over every text subtitle of a stream as SRT, the picked one first", () => {
    expect(
      getExternalPlayerSubtitles(api, { ...online, subtitleIndex: 3 }, item),
    ).toEqual({
      uris: [srt("source-1", 3), srt("source-1", 2)],
      selected: srt("source-1", 3),
    });
  });

  it("selects the source's default when nothing was picked", () => {
    expect(getExternalPlayerSubtitles(api, online, item).selected).toBe(
      srt("source-1", 3),
    );
  });

  it("selects none, but still hands them over, when subtitles are off", () => {
    expect(
      getExternalPlayerSubtitles(api, { ...online, subtitleIndex: -1 }, item),
    ).toEqual({ uris: [srt("source-1", 2), srt("source-1", 3)] });
  });

  // An item page loads MediaSources apart from the item it plays.
  it("takes the subtitles of the media source it is given over the item's", () => {
    expect(
      getExternalPlayerSubtitles(api, online, {}, item.MediaSources![1]).uris,
    ).toEqual([srt("source-2", 5)]);
  });

  it("takes the subtitles of the version being played", () => {
    expect(
      getExternalPlayerSubtitles(
        api,
        { ...online, mediaSourceId: "source-2" },
        item,
      ).uris,
    ).toEqual([srt("source-2", 5)]);
  });

  it("hands over the subtitle files saved with a download", () => {
    mockDownloaded["item-1"] = {
      userData: { subtitleStreamIndex: 1 },
      mediaSource: {
        MediaStreams: [
          { Type: "Subtitle", Index: 0, DeliveryUrl: "file:///docs/a.srt" },
          { Type: "Subtitle", Index: 1, DeliveryUrl: "file:///docs/b.srt" },
          // Never saved: the server's URL, which is useless offline.
          { Type: "Subtitle", Index: 2, DeliveryUrl: "/Videos/item-1/sub" },
          // Saved, then deleted.
          { Type: "Subtitle", Index: 3, DeliveryUrl: "file:///docs/d.srt" },
        ],
      },
    };
    mockExisting.add("file:///docs/a.srt");
    mockExisting.add("file:///docs/b.srt");

    expect(getExternalPlayerSubtitles(api, offline, item)).toEqual({
      uris: ["content://provider/docs/b.srt", "content://provider/docs/a.srt"],
      selected: "content://provider/docs/b.srt",
    });
  });

  it("has none without a signed in api or a known source", () => {
    expect(getExternalPlayerSubtitles(null, online, item).uris).toEqual([]);
    expect(getExternalPlayerSubtitles(api, online, {}).uris).toEqual([]);
  });
});

describe("buildExternalPlayerSubtitleExtras", () => {
  it("lists every subtitle and enables the selected one", () => {
    expect(
      buildExternalPlayerSubtitleExtras({ uris: ["a", "b"], selected: "a" }),
    ).toEqual({ subs: ["a", "b"], "subs.enable": ["a"] });
  });

  it("enables none when subtitles are off", () => {
    expect(buildExternalPlayerSubtitleExtras({ uris: ["a"] })).toEqual({
      subs: ["a"],
    });
  });

  it("sends nothing without subtitles", () => {
    expect(buildExternalPlayerSubtitleExtras({ uris: [] })).toBeUndefined();
  });
});

describe("buildExternalPlayerLaunchParams", () => {
  const item: BaseItemDto = {
    Name: "A Movie",
    UserData: { PlaybackPositionTicks: 600_000_000 },
  };

  it("asks for the position back, names the video and hides the link", () => {
    expect(buildExternalPlayerLaunchParams(online, item)).toEqual({
      return_result: true,
      secure_uri: true,
      position: 60_000,
      title: "A Movie",
    });
  });
  it("starts at the requested position over the stored one", () => {
    expect(
      buildExternalPlayerLaunchParams(
        { ...online, playbackPositionTicks: 100_000_000 },
        item,
      ).position,
    ).toBe(10_000);
  });

  // The resume dialog's "start over" sends 0: that must not resume.
  it("sends no position for a play from the beginning", () => {
    expect(
      buildExternalPlayerLaunchParams(
        { ...online, playbackPositionTicks: 0 },
        item,
      ),
    ).not.toHaveProperty("position");
  });
});

describe("readExternalPlayerResult", () => {
  it("reads VLC's position", () => {
    expect(readExternalPlayerResult({ extra_position: 90_000 })).toEqual({
      completed: false,
      positionTicks: 900_000_000,
    });
  });

  it("reads the MX Player API position", () => {
    expect(
      readExternalPlayerResult({ position: 90_000, end_by: "user" }),
    ).toEqual({ completed: false, positionTicks: 900_000_000 });
  });

  it("reads a video that ran to its end as completed", () => {
    expect(readExternalPlayerResult({ end_by: "playback_completion" })).toEqual(
      { completed: true },
    );
  });

  // Reporting any of these would wipe the item's resume point.
  it.each([
    ["no extras", undefined],
    ["unknown keys", { some_player_time: 90_000 }],
    ["a zero position", { position: 0 }],
    ["a negative position", { extra_position: -1 }],
    ["a position that is not a number", { position: "90000" }],
    ["a position that is not finite", { position: Number.NaN }],
  ])("ignores %s", (_, extra) => {
    expect(readExternalPlayerResult(extra)).toBeNull();
  });
});
