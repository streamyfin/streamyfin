import { isUnmeteredConnection, lacksMediaSource } from "./downloadRequest";

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

describe("isUnmeteredConnection", () => {
  const state = (
    type: string,
    details: { isConnectionExpensive?: boolean } | null = null,
    isConnected = true,
  ) => ({ type, details, isConnected }) as never;

  test.each(["wifi", "ethernet"])("lets downloads run on %s", (type) => {
    expect(isUnmeteredConnection(state(type))).toBe(true);
  });

  test("holds them back on mobile data", () => {
    expect(
      isUnmeteredConnection(
        state("cellular", { isConnectionExpensive: false }),
      ),
    ).toBe(false);
  });

  test("holds them back without a connection", () => {
    expect(isUnmeteredConnection(state("wifi", null, false))).toBe(false);
  });

  // A VPN hides the link under it; the system still knows whether it is metered.
  test("asks the system about any other connection", () => {
    expect(
      isUnmeteredConnection(state("vpn", { isConnectionExpensive: false })),
    ).toBe(true);
    expect(
      isUnmeteredConnection(state("vpn", { isConnectionExpensive: true })),
    ).toBe(false);
    expect(isUnmeteredConnection(state("unknown"))).toBe(false);
  });
});
