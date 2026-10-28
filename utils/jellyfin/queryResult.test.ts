import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { AxiosError } from "axios";
import { makeApi } from "@/test-utils/jellyfinApi";
import { describeHttpError } from "@/utils/errors";
import { queryResultItems } from "./queryResult";

const EPISODE = { Id: "episode-1", Type: "Episode" };

/** What the SDK resolves a season's episodes with, when the server sends this. */
const answered = (body: unknown, headers: Record<string, string> = {}) => {
  const api = makeApi();
  api.mock.onGet(/\/Shows\/[^/]+\/Episodes/).reply(200, body, headers);
  return getTvShowsApi(api).getEpisodes({
    seriesId: "series-1",
    seasonId: "season-1",
    userId: "user-1",
  });
};

const thrownBy = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Nothing was thrown");
};

describe("queryResultItems", () => {
  test("reads the items of a query result", async () => {
    const response = await answered({ Items: [EPISODE], TotalRecordCount: 1 });
    expect(queryResultItems(response)).toEqual([EPISODE]);
  });

  test("a season without episodes is an empty list, not a failure", async () => {
    const response = await answered({ Items: [], TotalRecordCount: 0 });
    expect(queryResultItems(response)).toEqual([]);
  });

  // REACT-NATIVE-1N. Jellyfin always sends Items, an empty list included, so
  // a 200 without a list is something else answering in its place.
  test.each([
    ["an HTML page", "<!DOCTYPE html><html><head><title>Sign in</title>"],
    ["an empty body", ""],
    ["JSON null", "null"],
    ["JSON without Items", { TotalRecordCount: 0 }],
    ["Items that are not a list", { Items: null, TotalRecordCount: 0 }],
    ["a list that is not in a query result", [EPISODE]],
  ])("throws the answer when it is %s", async (_name, body) => {
    const response = await answered(body);

    const error = thrownBy(() => queryResultItems(response));

    expect(error).toBeInstanceOf(AxiosError);
    expect((error as AxiosError).response).toBe(response);
    // What the app's reporting groups the failure by.
    expect(describeHttpError(error)).toEqual({
      method: "GET",
      path: "/Shows/series-1/Episodes",
      status: 200,
    });
  });
});
