import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { makeApi } from "@/test-utils/jellyfinApi";
import { generateTrickplayUrl, getTrickplayInfo } from "./trickplay";

const item: BaseItemDto = {
  Id: "item-1",
  RunTimeTicks: 36_000_000_000, // 1 hour
  Trickplay: {
    "item-1": {
      "320": {
        Interval: 10_000,
        TileWidth: 10,
        TileHeight: 10,
        Width: 320,
        Height: 180,
      },
    },
  },
};

describe("generateTrickplayUrl", () => {
  test("URL points at the trickplay sheet, authenticated with ApiKey", () => {
    // expo-image cannot attach an Authorization header to a source it
    // prefetches through ServerImage, so the sheet URL carries the token.
    const url = generateTrickplayUrl(item, 2, makeApi());

    expect(url).toBe(
      "https://jellyfin.example.com/Videos/item-1/Trickplay/320/2.jpg?ApiKey=SECRET_TOKEN",
    );
  });
});

describe("alternate versions", () => {
  // Trickplay is keyed by media source ID: on Jellyfin 12 an episode's
  // alternate version has its own sheets, and reading the item ID's entry
  // showed the primary version's thumbnails (or none) while playing another.
  const versioned: BaseItemDto = {
    ...item,
    Trickplay: {
      "item-1": item.Trickplay!["item-1"],
      "version-2": {
        "480": {
          Interval: 5_000,
          TileWidth: 10,
          TileHeight: 10,
          Width: 480,
          Height: 200,
          // A longer cut: 1h30 at 5s per thumbnail.
          ThumbnailCount: 1_080,
        },
      },
    },
  };

  test("reads the playing version's trickplay entry", () => {
    expect(getTrickplayInfo(versioned, "version-2")?.resolution).toBe("480");
  });

  test("counts sheets from the version's thumbnails, not the primary's runtime", () => {
    // 1080 thumbnails at 100 per sheet; the primary's hour would give 72.
    expect(getTrickplayInfo(versioned, "version-2")?.totalImageSheets).toBe(11);
  });

  test("defaults to the primary version without a source ID", () => {
    expect(getTrickplayInfo(versioned)?.resolution).toBe("320");
  });

  test("a version without trickplay gets none, not the primary's", () => {
    const grouped = {
      ...item,
      MediaSources: [{ Id: "item-1" }, { Id: "version-2" }],
    };
    expect(getTrickplayInfo(grouped, "version-2")).toBeNull();
  });

  test("a plugin stream without its own entry uses the item's sheets", () => {
    // Not a version: its source ID names no item and has no trickplay.
    const streamed = {
      ...item,
      MediaSources: [{ Id: "stream-a" }, { Id: "stream-b" }],
    };
    expect(getTrickplayInfo(streamed, "stream-a")?.resolution).toBe("320");
    expect(generateTrickplayUrl(streamed, 0, makeApi(), "stream-a")).toBe(
      "https://jellyfin.example.com/Videos/item-1/Trickplay/320/0.jpg?ApiKey=SECRET_TOKEN",
    );
  });

  test("the sheet URL names the playing version", () => {
    expect(generateTrickplayUrl(versioned, 2, makeApi(), "version-2")).toBe(
      "https://jellyfin.example.com/Videos/item-1/Trickplay/480/2.jpg?ApiKey=SECRET_TOKEN&MediaSourceId=version-2",
    );
  });

  test("the primary version's URL stays unchanged", () => {
    expect(generateTrickplayUrl(versioned, 2, makeApi(), "item-1")).toBe(
      "https://jellyfin.example.com/Videos/item-1/Trickplay/320/2.jpg?ApiKey=SECRET_TOKEN",
    );
  });
});
