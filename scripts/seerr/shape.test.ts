import { describe, expect, test } from "bun:test";
import { pathsOf, shapeOf } from "./shape";

describe("shapeOf", () => {
  test("keeps the keys and the types, never the values", () => {
    expect(shapeOf({ id: 7, title: "Dune", adult: false })).toEqual({
      adult: "boolean",
      id: "number",
      title: "string",
    });
  });

  test("describes an array by its first element", () => {
    expect(shapeOf([{ id: 1 }, { id: 2 }])).toEqual({ "[]": { id: "number" } });
  });

  test("says an empty array is empty rather than guessing", () => {
    expect(shapeOf([])).toBe("array<empty>");
  });

  // A field declared non-nullable and served null is one of the three kinds of
  // gap measured against a real server, and flattening null into "object"
  // would hide it.
  test("keeps null apart from a missing key", () => {
    expect(shapeOf({ plexUsername: null })).toEqual({ plexUsername: "null" });
  });

  test("stops descending so a deep response cannot blow the fixture up", () => {
    expect(shapeOf({ a: { b: { c: { d: { e: 1 } } } } })).toEqual({
      a: { b: { c: "object" } },
    });
  });

  // The fixtures land in the repository and are read in review, so two
  // captures of the same route have to produce the same file.
  test("orders keys so the same response gives the same fixture", () => {
    expect(JSON.stringify(shapeOf({ b: 1, a: 2 }))).toBe(
      JSON.stringify(shapeOf({ a: 2, b: 1 })),
    );
  });
});

describe("pathsOf", () => {
  // The same notation generate-types.ts writes, because the contract test puts
  // the two lists side by side and compares them.
  test("flattens a shape the way the generated shapes are written", () => {
    expect(
      pathsOf({
        pageInfo: { page: "number" },
        results: { "[]": { id: "number", email: "string" } },
      }),
    ).toEqual([
      "pageInfo",
      "pageInfo.page",
      "results",
      "results[]",
      "results[].id",
      "results[].email",
    ]);
  });

  test("names the elements of a top level array", () => {
    expect(pathsOf({ "[]": { id: "number" } })).toEqual(["[]", "[].id"]);
  });

  test("has nothing to say about a leaf", () => {
    expect(pathsOf("string")).toEqual([]);
  });
});
