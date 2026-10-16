import {
  hasHeaders,
  optionsWithOptionalHeaders,
  sourceWithOptionalHeaders,
} from "./optionalHeaders";

describe("hasHeaders", () => {
  test("is false for empty, null and undefined", () => {
    expect(hasHeaders({})).toBe(false);
    expect(hasHeaders(null)).toBe(false);
    expect(hasHeaders(undefined)).toBe(false);
  });

  test("is true when at least one header is present", () => {
    expect(hasHeaders({ "X-Token": "1" })).toBe(true);
  });
});

describe("sourceWithOptionalHeaders", () => {
  test("omits the headers key entirely when there is nothing to send", () => {
    const source = sourceWithOptionalHeaders("https://example.com/a.jpg", {});
    expect(source).toEqual({ uri: "https://example.com/a.jpg" });
    expect("headers" in source).toBe(false);
  });

  test("attaches headers when configured", () => {
    expect(
      sourceWithOptionalHeaders("https://example.com/a.jpg", { "X-A": "1" }),
    ).toEqual({ uri: "https://example.com/a.jpg", headers: { "X-A": "1" } });
  });
});

describe("optionsWithOptionalHeaders", () => {
  test("returns the same object when there are no headers", () => {
    const options = { method: "HEAD" };
    expect(optionsWithOptionalHeaders(options, undefined)).toBe(options);
  });

  test("merges into existing headers without mutating the input", () => {
    const options = { method: "GET", headers: { Accept: "*/*" } };
    expect(optionsWithOptionalHeaders(options, { "X-A": "1" })).toEqual({
      method: "GET",
      headers: { Accept: "*/*", "X-A": "1" },
    });
    expect(options.headers).toEqual({ Accept: "*/*" });
  });
});
