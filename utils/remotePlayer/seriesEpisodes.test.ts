import { makeApi } from "@/test-utils/jellyfinApi";
import { seriesEpisodes } from "./seriesEpisodes";

describe("seriesEpisodes", () => {
  test("seriesEpisodes asks the server for the series in order, missing ones left out", async () => {
    const api = makeApi();
    api.mock.onGet(/\/Shows\/series-1\/Episodes/).reply(200, {
      Items: [
        { Id: "s1e2", Name: "Second", RunTimeTicks: 13_200_000_000 },
        { Id: "s1e1", Name: null },
        { Name: "No id, never playable" },
      ],
    });

    const episodes = await seriesEpisodes(api, "user-1", "series-1");

    // The server's order is the one its series page and the local player follow.
    expect(episodes).toEqual([
      { id: "s1e2", name: "Second", runTimeTicks: 13_200_000_000 },
      { id: "s1e1", name: null, runTimeTicks: null },
    ]);
    const [request] = api.mock.history.get;
    const query = new URL(request.url ?? "").searchParams;
    expect(query.get("userId")).toBe("user-1");
    expect(query.get("isMissing")).toBe("false");
  });
});
