import { toDirectPlayerQuery } from "./playRequest";

const position = (query: string) =>
  new URLSearchParams(query).get("playbackPosition");

describe("toDirectPlayerQuery", () => {
  // A top shelf play link and a remote Play command carry an item id and no
  // position. The route treats a position of 0 as "start at the beginning",
  // so writing one for them made the JS player ignore the item's resume
  // point, and the stop report that followed cleared it on the server.
  test("leaves the position out for a request that has none, so the player resumes", () => {
    expect(position(toDirectPlayerQuery({ itemId: "a", offline: false }))).toBe(
      "",
    );
  });

  test("keeps an explicit 0, which is how play from the beginning is asked for", () => {
    expect(
      position(
        toDirectPlayerQuery({
          itemId: "a",
          offline: false,
          playbackPositionTicks: 0,
        }),
      ),
    ).toBe("0");
  });

  test("passes a resume position through", () => {
    expect(
      position(
        toDirectPlayerQuery({
          itemId: "a",
          offline: false,
          playbackPositionTicks: 11_580_000_000,
        }),
      ),
    ).toBe("11580000000");
  });
});
