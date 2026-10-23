import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { ExternalPlayerMode } from "@/constants/ExternalPlayer";
import {
  buildExternalPlayerLaunchParams,
  getExternalPlayerUri,
  isExternalPlayerEnabled,
  readExternalPlayerResult,
  shouldUseExternalPlayer,
} from "./externalPlayer";

const mockExisting = new Set<string>();
let mockDownloaded: Record<string, { videoFilePath: string }> = {};

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

describe("buildExternalPlayerLaunchParams", () => {
  const item: BaseItemDto = {
    Name: "A Movie",
    UserData: { PlaybackPositionTicks: 600_000_000 },
  };

  it("asks for the position back and names the video", () => {
    expect(buildExternalPlayerLaunchParams(online, item)).toEqual({
      return_result: true,
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
