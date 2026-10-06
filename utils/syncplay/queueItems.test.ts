import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { SYNCPLAY_QUEUE_ADD_LIMIT } from "@/constants/SyncPlay";
import { syncPlayQueueIds } from "./queueItems";

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
