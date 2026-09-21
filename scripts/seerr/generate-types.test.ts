import { describe, expect, test } from "bun:test";
import {
  checkPin,
  declaredShapes,
  fingerprint,
  pinUrl,
} from "./generate-types";

describe("the pinned spec", () => {
  test("is fetched from the ref the pin names", () => {
    expect(
      pinUrl({ repo: "seerr-team/seerr", ref: "v3.4.1", sha256: "" }),
    ).toBe(
      "https://raw.githubusercontent.com/seerr-team/seerr/v3.4.1/seerr-api.yml",
    );
  });

  // Recorded rather than recomputed: a test that hashes the input with the
  // same call it is testing passes whatever the call does.
  test("is fingerprinted so a hand edit shows up", () => {
    expect(fingerprint("openapi: 3.0.2\n")).toBe(
      "acddd61ac40eb819f6bd4e886056943783c8499affc0f6c62b6df14e77295999",
    );
  });
});

describe("checkPin", () => {
  const pin = { repo: "seerr-team/seerr", ref: "v3.4.1", sha256: "abc" };

  test("accepts the spec the pin recorded", () => {
    expect(() => checkPin(pin, "abc")).not.toThrow();
  });

  test("records the first one rather than refusing it", () => {
    expect(() => checkPin({ ...pin, sha256: "" }, "abc")).not.toThrow();
  });

  // A tag is supposed to be the thing that cannot move. When it does, the
  // types would change under a ref that says they cannot, so this stops
  // rather than papering over it.
  test("refuses a tag that moved", () => {
    expect(() => checkPin(pin, "def")).toThrow(/no longer matches/);
  });
});

describe("declaredShapes", () => {
  test("flattens a declared response into property paths", () => {
    const spec = {
      paths: {
        "/user": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        pageInfo: {
                          type: "object",
                          properties: { page: { type: "number" } },
                        },
                        results: {
                          type: "array",
                          items: { $ref: "#/components/schemas/User" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          User: { type: "object", properties: { id: { type: "number" } } },
        },
      },
    };

    expect(declaredShapes(spec)).toEqual({
      "GET /user": [
        "pageInfo",
        "pageInfo.page",
        "results",
        "results[]",
        "results[].id",
      ],
    });
  });

  // MediaInfo and MediaRequest refer to each other in the real spec, so
  // without this the walk does not terminate.
  test("stops at a schema that refers to itself", () => {
    const spec = {
      paths: {
        "/a": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Node" },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Node: {
            type: "object",
            properties: { child: { $ref: "#/components/schemas/Node" } },
          },
        },
      },
    };

    expect(declaredShapes(spec)["GET /a"]).toEqual(["child"]);
  });

  test("merges the parts of an allOf", () => {
    const spec = {
      paths: {
        "/a": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      allOf: [
                        {
                          type: "object",
                          properties: { id: { type: "number" } },
                        },
                        {
                          type: "object",
                          properties: { name: { type: "string" } },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    expect(declaredShapes(spec)["GET /a"]).toEqual(["id", "name"]);
  });

  // /search and /discover/trending return one of three result shapes. A
  // caller gets the union, so the declared shape is the union too: the
  // contract test asks whether a served key is known, not which variant it
  // came from.
  test("takes every variant of a union", () => {
    const spec = {
      paths: {
        "/search": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "array",
                      items: {
                        anyOf: [
                          { $ref: "#/components/schemas/MovieResult" },
                          { $ref: "#/components/schemas/PersonResult" },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          MovieResult: {
            type: "object",
            properties: { id: { type: "number" }, title: { type: "string" } },
          },
          PersonResult: {
            type: "object",
            properties: { id: { type: "number" }, name: { type: "string" } },
          },
        },
      },
    };

    expect(declaredShapes(spec)["GET /search"]).toEqual([
      "[]",
      "[].id",
      "[].title",
      "[].name",
    ]);
  });

  // /certifications/movie answers a map keyed by country code. Those keys
  // are data, not declared properties, so they are described once as `*`
  // and the contract test matches any key against it.
  test("describes a free-form map by its value shape", () => {
    const spec = {
      paths: {
        "/certifications/movie": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        certifications: {
                          type: "object",
                          additionalProperties: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: { order: { type: "number" } },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    expect(declaredShapes(spec)["GET /certifications/movie"]).toEqual([
      "certifications",
      "certifications.*",
      "certifications.*[]",
      "certifications.*[].order",
    ]);
  });

  // WatchProviders.flatrate carries `items` and no `type: array` in the real
  // spec, while its sibling `buy` carries both. Reading only `type` dropped
  // four declared properties on /movie/{movieId} and /tv/{tvId}.
  test("treats a schema with items as an array, declared or not", () => {
    const spec = {
      paths: {
        "/a": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        flatrate: {
                          items: {
                            type: "object",
                            properties: { id: { type: "number" } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    expect(declaredShapes(spec)["GET /a"]).toEqual([
      "flatrate",
      "flatrate[]",
      "flatrate[].id",
    ]);
  });

  test("names a top level map without a leading dot", () => {
    const spec = {
      paths: {
        "/a": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      additionalProperties: {
                        type: "object",
                        properties: { id: { type: "number" } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    expect(declaredShapes(spec)["GET /a"]).toEqual(["*", "*.id"]);
  });

  test("leaves out an operation that answers without a JSON body", () => {
    const spec = {
      paths: {
        "/a": { post: { responses: { "204": { description: "Gone" } } } },
      },
    };

    expect(declaredShapes(spec)).toEqual({});
  });
});
