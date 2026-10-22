import { AxiosError } from "axios";
import { makeApi } from "@/test-utils/jellyfinApi";
import { describeHttpError } from "@/utils/errors";
import { getUserItemData } from "./getUserItemData";

const SERIES = { Id: "a1b2c3d4e5f60718293a4b5c6d7e8f90", Type: "Series" };
const ITEM_ROUTE = /\/Items\/[^/?]+(\?|$)/;
const JSON_TYPE = { "content-type": "application/json; charset=utf-8" };

const answering = (body: unknown, headers: Record<string, string>) => {
  const api = makeApi();
  api.mock.onGet(ITEM_ROUTE).reply(200, body, headers);
  return api;
};

const fetchSeries = (api: ReturnType<typeof makeApi>) =>
  getUserItemData({ api, itemId: SERIES.Id, userId: "user-1" });

describe("getUserItemData", () => {
  test("gives the item the server sent", async () => {
    expect(await fetchSeries(answering(SERIES, JSON_TYPE))).toEqual(SERIES);
  });

  test("asks nothing without an api, an item or a user", async () => {
    const api = makeApi();
    expect(
      await getUserItemData({ api, itemId: null, userId: "u" }),
    ).toBeNull();
    expect(
      await getUserItemData({ api: null, itemId: SERIES.Id, userId: "u" }),
    ).toBeNull();
    expect(api.mock.history.get).toHaveLength(0);
  });

  // REACT-NATIVE-NY: resolved with, such an answer was cached and saved as
  // the series, and the series page threw reading it as one.
  test.each([
    [
      "a proxy's sign-in page",
      "<!doctype html><html><title>Sign in</title></html>",
      { "content-type": "text/html; charset=utf-8" },
    ],
    ["an empty body", "", {}],
    ["JSON of another shape", { message: "Not found" }, JSON_TYPE],
    ["a list", [SERIES], JSON_TYPE],
  ])("throws the answer when it is %s", async (_name, body, headers) => {
    const error = await fetchSeries(answering(body, headers)).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(AxiosError);
    expect((error as AxiosError).response?.data).toEqual(body);
    // What the app's reporting groups the failure by.
    expect(describeHttpError(error)).toEqual({
      method: "GET",
      path: "/Items/:id",
      status: 200,
    });
  });
});
