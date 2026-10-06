import { nativeIndexOf, nativeInsertIndexFor } from "./nativeQueue";

const ids = (...list: string[]) => list.map((id) => ({ id }));
const items = (...list: string[]) => list.map((Id) => ({ Id }));

const APP_QUEUE = items("a", "b", "c", "d", "e");

describe("nativeIndexOf", () => {
  test("finds a track by id wherever the native queue holds it", () => {
    expect(nativeIndexOf(ids("c", "e"), "e")).toBe(1);
  });

  test("reports a track that is not loaded yet", () => {
    expect(nativeIndexOf(ids("c", "e"), "a")).toBe(-1);
    expect(nativeIndexOf([], "a")).toBe(-1);
  });

  test("picks the copy the app queue points at when a track is queued twice", () => {
    expect(nativeIndexOf(ids("a", "b", "a"), "a", 2)).toBe(2);
    expect(nativeIndexOf(ids("a", "b", "a"), "a", 0)).toBe(0);
  });

  test("falls back to the id when the queues do not line up at the app index", () => {
    expect(nativeIndexOf(ids("c", "e"), "e", 4)).toBe(1);
    expect(nativeIndexOf(ids("c", "e"), "e", 0)).toBe(1);
  });

  test("never matches a missing id against a track without one", () => {
    expect(nativeIndexOf([{}], undefined)).toBe(-1);
    expect(nativeIndexOf([{}], null)).toBe(-1);
  });
});

describe("nativeInsertIndexFor", () => {
  test("inserts in front of the first later track that is loaded", () => {
    expect(nativeInsertIndexFor(APP_QUEUE, 1, ids("a", "d", "e"))).toBe(1);
    expect(nativeInsertIndexFor(APP_QUEUE, 0, ids("c"))).toBe(0);
  });

  test("appends when nothing after the track is loaded", () => {
    expect(nativeInsertIndexFor(APP_QUEUE, 3, ids("a", "c"))).toBeUndefined();
    expect(nativeInsertIndexFor(APP_QUEUE, 4, ids("a"))).toBeUndefined();
    expect(nativeInsertIndexFor(APP_QUEUE, 2, [])).toBeUndefined();
  });

  // The index it returns always belongs to a loaded track, so it can never be
  // past the end of the native queue, which is what the native side rejects.
  test("stays inside a native queue shorter than the app queue", () => {
    const native = ids("e");
    for (let appIndex = 0; appIndex < APP_QUEUE.length; appIndex++) {
      const index = nativeInsertIndexFor(APP_QUEUE, appIndex, native);
      expect(index ?? native.length).toBeLessThanOrEqual(native.length);
    }
  });
});
