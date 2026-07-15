import { describe, expect, mock, test } from "bun:test";
import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { atom } from "jotai";

// JellyfinProvider drags in the React Native / Expo runtime; only its
// `apiAtom` export is needed here.
mock.module("@/providers/JellyfinProvider", () => ({
  apiAtom: atom<Api | null>(null),
}));

const { apiAtom } = await import("@/providers/JellyfinProvider");
const { store } = await import("@/utils/store");
const { makeApi } = await import("@/test-utils/jellyfinApi");
const { generateTrickplayUrl } = await import("./trickplay");

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
  test("URL points at the trickplay sheet and embeds no credentials", () => {
    store.set(apiAtom, makeApi());

    const url = generateTrickplayUrl(item, 2);

    expect(url).toBe(
      "https://jellyfin.example.com/Videos/item-1/Trickplay/320/2.jpg",
    );
  });
});
