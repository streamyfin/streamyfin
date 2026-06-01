import { describe, expect, test } from "bun:test";
import { findNextEpisode } from "./episodes";

const ep = (id: string) => ({ Id: id });

describe("findNextEpisode", () => {
  test("returns the episode after the current one", () => {
    expect(findNextEpisode([ep("a"), ep("b"), ep("c")], "b")).toEqual(ep("c"));
  });
  test("returns null on the last episode", () => {
    expect(findNextEpisode([ep("a"), ep("b")], "b")).toBeNull();
  });
  test("returns null when the current id is not found", () => {
    expect(findNextEpisode([ep("a"), ep("b")], "x")).toBeNull();
  });
  test("returns null for an empty list", () => {
    expect(findNextEpisode([], "a")).toBeNull();
  });
});
