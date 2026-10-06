import { lacksMediaSource } from "./downloadRequest";

describe("lacksMediaSource", () => {
  // Sentry REACT-NATIVE-FX: the server lists no media source for an item it
  // cannot play (a folder, a photo, a book), the download sheet opened all the
  // same, and confirming it threw "No api or user or item".
  test("turns down a single item the server gave no media source for", () => {
    expect(lacksMediaSource(1, undefined)).toBe(true);
  });

  test("turns down a single item whose media source has no id", () => {
    expect(lacksMediaSource(1, { Name: "1080p" })).toBe(true);
  });

  test("lets a single item with a media source through", () => {
    expect(lacksMediaSource(1, { Id: "source-1" })).toBe(false);
  });

  // The sheet only holds a source for a single item. Each episode of a season
  // resolves its own once the download starts, so none is needed up front.
  test("asks nothing of a download of several items", () => {
    expect(lacksMediaSource(2, undefined)).toBe(false);
  });
});
