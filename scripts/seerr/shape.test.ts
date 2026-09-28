import { describe, expect, test } from "bun:test";
import { allowsNull, pathsOf, propertyAt, shapeOf } from "./shape";

describe("shapeOf", () => {
  test("keeps the keys and the types, never the values", () => {
    expect(shapeOf({ id: 7, title: "Dune", adult: false })).toEqual({
      adult: "boolean",
      id: "number",
      title: "string",
    });
  });

  test("describes the elements of an array once", () => {
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

  // Deep enough for the paths the spec declares, and no deeper: a response
  // that nests further than the contract compares would only make the fixture
  // bigger to read.
  test("stops descending eventually", () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } };

    expect(shapeOf(deep)).toEqual({
      a: { b: { c: { d: { e: { f: { g: "object" } } } } } },
    });
  });

  // A property the server omits on one element and sends on the next. It
  // stays in the fixture, marked the way TypeScript marks it, so a key some
  // element went without never reads as one every element carried.
  test("marks a key some element went without, in either order", () => {
    const expected = { "[]": { id: "number", "title?": "string" } };

    expect(shapeOf([{ id: 1 }, { id: 2, title: "Dune" }])).toEqual(expected);
    expect(shapeOf([{ id: 2, title: "Dune" }, { id: 1 }])).toEqual(expected);
  });

  test("marks a key inside a nested object the same way", () => {
    expect(
      shapeOf([{ media: { id: 1, mediaUrl: "x" } }, { media: { id: 2 } }]),
    ).toEqual({ "[]": { media: { id: "number", "mediaUrl?": "string" } } });
  });

  // Nullability is one of the three kinds of gap the contract test measures,
  // so an element that carries null and another that carries a value has to
  // leave both in the fixture.
  test("keeps both readings when elements disagree", () => {
    expect(shapeOf([{ airDate: null }, { airDate: "2026-01-01" }])).toEqual({
      "[]": { airDate: "null|string" },
    });
  });

  // A title Seerr has not seen sends null where another sends an object.
  // Letting null win would drop every path under the object from the
  // comparison without anything turning red.
  test("keeps an object another element sends as null, in either order", () => {
    const expected = {
      "[]": { media: { "|": "null", id: "number" } },
    };

    expect(shapeOf([{ media: { id: 1 } }, { media: null }])).toEqual(expected);
    expect(shapeOf([{ media: null }, { media: { id: 1 } }])).toEqual(expected);
  });

  // An empty array says nothing about what the array holds, so a filled one
  // decides, whichever came first.
  test("keeps an array another element sends empty, in either order", () => {
    const expected = { "[]": { seasons: { "[]": { id: "number" } } } };

    expect(shapeOf([{ seasons: [] }, { seasons: [{ id: 1 }] }])).toEqual(
      expected,
    );
    expect(shapeOf([{ seasons: [{ id: 1 }] }, { seasons: [] }])).toEqual(
      expected,
    );
  });

  test("notes null beside an array as beside an object", () => {
    expect(shapeOf([{ tags: null }, { tags: [1] }])).toEqual({
      "[]": { tags: { "|": "null", "[]": "number" } },
    });
  });

  // Keys and an element description cannot share one object, and picking
  // either would describe something the server did not send.
  test("stops on an array against an object", () => {
    expect(() => shapeOf([{ ids: [1] }, { ids: { id: 1 } }])).toThrow();
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

  // The generated shapes know nothing of the marks, so a path is the same
  // whether every element carried the key or some went without it.
  test("names a marked key without its marks", () => {
    expect(
      pathsOf({
        "releaseDate?": "string",
        media: { "|": "null", id: "number" },
        tags: { "|": "null", "[]": "number" },
      }),
    ).toEqual(["releaseDate", "media", "media.id", "tags", "tags[]"]);
  });
});

describe("propertyAt", () => {
  const shape = {
    results: {
      "[]": {
        id: "number",
        "title?": "string",
        media: { "|": "null", status: "number" },
      },
    },
  };

  test("finds a key every element carried", () => {
    expect(propertyAt(shape, "results[].id")).toEqual({
      shape: "number",
      optional: false,
    });
  });

  test("finds a key some element went without, and says so", () => {
    expect(propertyAt(shape, "results[].title")).toEqual({
      shape: "string",
      optional: true,
    });
  });

  test("walks through an object some element sent as null", () => {
    expect(propertyAt(shape, "results[].media.status")?.shape).toBe("number");
  });

  test("has nothing where the capture never went", () => {
    expect(propertyAt(shape, "results[].genres")).toBeUndefined();
    expect(propertyAt(shape, "results[].id.value")).toBeUndefined();
  });

  test("never mistakes a property of every object for a key", () => {
    expect(propertyAt(shape, "results[].constructor")).toBeUndefined();
  });
});

describe("allowsNull", () => {
  test("reads a leaf", () => {
    expect(allowsNull("null|string")).toBe(true);
    expect(allowsNull("string")).toBe(false);
  });

  test("reads what sits beside an object or an array", () => {
    expect(allowsNull({ "|": "null", id: "number" })).toBe(true);
    expect(allowsNull({ id: "number" })).toBe(false);
  });
});
