import { makeApi } from "@/test-utils/jellyfinApi";
import { syncPlayQueuePosterUrl } from "./queueDisplay";

const api = makeApi();

describe("syncPlayQueuePosterUrl", () => {
  test("shows an episode's series poster", () => {
    const url = syncPlayQueuePosterUrl(api, {
      Id: "episode-1",
      Type: "Episode",
      SeriesId: "series-1",
      SeriesPrimaryImageTag: "series-tag",
      ImageTags: { Primary: "still-tag" },
    });

    expect(url).toContain("/Items/series-1/Images/Primary?");
    expect(url).toContain("tag=series-tag");
  });

  test("shows a film's own poster", () => {
    const url = syncPlayQueuePosterUrl(api, {
      Id: "movie-1",
      Type: "Movie",
      ImageTags: { Primary: "poster-tag" },
    });

    expect(url).toContain("/Items/movie-1/Images/Primary?");
    expect(url).toContain("tag=poster-tag");
  });
});
