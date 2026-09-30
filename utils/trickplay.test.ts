import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { makeApi } from "@/test-utils/jellyfinApi";
import { generateTrickplayUrl } from "./trickplay";

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
