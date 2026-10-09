import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  SYNCPLAY_ITEM_LOOKUP_CHUNK,
  SYNCPLAY_QUEUE_ADD_LIMIT,
} from "@/constants/SyncPlay";
import {
  syncPlayLookupChunks,
  syncPlayLookupKey,
  syncPlayQueueIds,
} from "./queueItems";

const episode = (
  id: string,
  extra: Partial<BaseItemDto> = {},
): BaseItemDto => ({
  Id: id,
  Type: "Episode",
  ...extra,
});

describe("syncPlayQueueIds", () => {
  test("keeps the order the page gave", () => {
    expect(
      syncPlayQueueIds([episode("a"), episode("b"), episode("c")]),
    ).toEqual(["a", "b", "c"]);
  });

  test("a movie is a queue of one", () => {
    expect(syncPlayQueueIds([{ Id: "movie", Type: "Movie" }])).toEqual([
      "movie",
    ]);
  });

  test("leaves out what has no file or is not a video", () => {
    expect(
      syncPlayQueueIds([
        episode("aired"),
        episode("missing", { LocationType: "Virtual" }),
        { Id: "series", Type: "Series" },
        { Id: "channel", Type: "TvChannel" },
        { Type: "Episode" },
        null,
        undefined,
      ]),
    ).toEqual(["aired"]);
  });

  test("a very long show is cut to what one request should carry", () => {
    const many = Array.from({ length: SYNCPLAY_QUEUE_ADD_LIMIT + 50 }, (_, i) =>
      episode(String(i)),
    );
    expect(syncPlayQueueIds(many)).toHaveLength(SYNCPLAY_QUEUE_ADD_LIMIT);
  });
});

describe("looking the queue's videos up", () => {
  const entry = (ItemId: string, PlaylistItemId: string) => ({
    ItemId,
    PlaylistItemId,
  });

  test("the key ignores order and copies", () => {
    expect(
      syncPlayLookupKey([entry("b", "1"), entry("a", "2"), entry("b", "3")]),
    ).toBe(syncPlayLookupKey([entry("a", "2"), entry("b", "1")]));
  });

  test("a queue as long as one add allows fits requests a server accepts", () => {
    const ids = Array.from({ length: SYNCPLAY_QUEUE_ADD_LIMIT }, (_, i) =>
      `${i}`.padStart(32, "0"),
    );
    const chunks = syncPlayLookupChunks([...ids, ids[0]]);
    expect(chunks.flat()).toEqual(ids);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(SYNCPLAY_ITEM_LOOKUP_CHUNK);
      // "ids=<guid>&", against the 8 KB request line of Kestrel and nginx.
      expect(chunk.length * 37).toBeLessThan(8192 / 2);
    }
  });

  test("nothing to look up is no request", () => {
    expect(syncPlayLookupChunks([])).toEqual([]);
  });
});
