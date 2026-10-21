import { rowLoadState } from "./rowLoadState";

describe("rowLoadState", () => {
  test("reports an empty row once its load succeeds without items", () => {
    expect(
      rowLoadState({ isPending: false, isError: false, itemCount: 0 }),
    ).toEqual({ isEmpty: true, failed: false });
  });

  test("reports a row with items as not empty", () => {
    expect(
      rowLoadState({ isPending: false, isError: false, itemCount: 3 }),
    ).toEqual({ isEmpty: false, failed: false });
  });

  // React Query pauses a first load while offline, with no error and no
  // data: read as empty, the screen said there was nothing on the watchlist
  // for lists that never loaded (#2171).
  test("leaves a row with no data yet unknown, even with nothing loading", () => {
    expect(
      rowLoadState({ isPending: true, isError: false, itemCount: 0 }),
    ).toEqual({ isEmpty: null, failed: false });
  });

  test("reports a failed load that left nothing to show", () => {
    expect(
      rowLoadState({ isPending: false, isError: true, itemCount: 0 }),
    ).toEqual({ isEmpty: null, failed: true });
  });

  // A failed background refetch keeps the items on screen. Counted as a
  // failure, it put the screen's error state above rows still showing their
  // items, and on TV its Retry button took the focus every minute (#2171).
  test("keeps a row whose refetch failed as a row with items", () => {
    expect(
      rowLoadState({ isPending: false, isError: true, itemCount: 3 }),
    ).toEqual({ isEmpty: false, failed: false });
  });
});
