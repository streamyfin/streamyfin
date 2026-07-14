import { describe, expect, test } from "bun:test";
import {
  hasHeaders,
  optionsWithOptionalHeaders,
  sourceWithOptionalHeaders,
} from "./optionalHeaders";

describe("hasHeaders", () => {
  test("returns false for missing or empty headers", () => {
    expect(hasHeaders()).toBe(false);
    expect(hasHeaders(null)).toBe(false);
    expect(hasHeaders({})).toBe(false);
  });

  test("returns true for non-empty headers", () => {
    expect(hasHeaders({ "X-Auth": "secret" })).toBe(true);
  });
});

describe("sourceWithOptionalHeaders", () => {
  test("omits headers when they are not present", () => {
    expect(sourceWithOptionalHeaders("https://example.test/image.jpg")).toEqual(
      {
        uri: "https://example.test/image.jpg",
      },
    );
    expect(
      sourceWithOptionalHeaders("https://example.test/image.jpg", null),
    ).toEqual({
      uri: "https://example.test/image.jpg",
    });
    expect(
      sourceWithOptionalHeaders("https://example.test/image.jpg", {}),
    ).toEqual({
      uri: "https://example.test/image.jpg",
    });
  });

  test("adds headers when present", () => {
    expect(
      sourceWithOptionalHeaders("https://example.test/image.jpg", {
        "X-Auth": "secret",
      }),
    ).toEqual({
      uri: "https://example.test/image.jpg",
      headers: { "X-Auth": "secret" },
    });
  });
});

describe("optionsWithOptionalHeaders", () => {
  test("preserves options without adding empty headers", () => {
    const options = { signal: new AbortController().signal };

    expect(optionsWithOptionalHeaders(options)).toBe(options);
    expect(optionsWithOptionalHeaders(options, null)).toBe(options);
    expect(optionsWithOptionalHeaders(options, {})).toBe(options);
  });

  test("merges headers with existing options when present", () => {
    const signal = new AbortController().signal;

    expect(
      optionsWithOptionalHeaders(
        { headers: { Accept: "application/json" }, signal },
        {
          "X-Auth": "secret",
        },
      ),
    ).toEqual({
      signal,
      headers: {
        Accept: "application/json",
        "X-Auth": "secret",
      },
    });
  });
});
