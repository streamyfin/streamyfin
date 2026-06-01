import { describe, expect, test } from "bun:test";
import { normalizeCustomHeaders } from "./normalizeCustomHeaders";
import type { CustomHeader } from "./secureCredentials";

const header = (key: string, value: string, enabled = true): CustomHeader => ({
  key,
  value,
  enabled,
});

describe("normalizeCustomHeaders", () => {
  test("returns an empty map for missing headers", () => {
    expect(normalizeCustomHeaders()).toEqual({});
    expect(normalizeCustomHeaders(null)).toEqual({});
  });

  test("trims keys and values for enabled headers", () => {
    expect(
      normalizeCustomHeaders([header(" X-Forwarded-User ", " alice ")]),
    ).toEqual({
      "X-Forwarded-User": "alice",
    });
  });

  test("skips disabled, blank, and invalid headers", () => {
    expect(
      normalizeCustomHeaders([
        header("X-Disabled", "secret", false),
        header("", "secret"),
        header("X-Blank", ""),
        header("Bad Header", "secret"),
        header("X-Control", "bad\nvalue"),
      ]),
    ).toEqual({});
  });

  test("keeps the first enabled header for case-insensitive duplicates", () => {
    expect(
      normalizeCustomHeaders([
        header("X-Auth", "first"),
        header("x-auth", "second"),
        header("X-Other", "third"),
      ]),
    ).toEqual({
      "X-Auth": "first",
      "X-Other": "third",
    });
  });

  test("skips malformed stored entries instead of throwing", () => {
    expect(
      normalizeCustomHeaders([
        undefined,
        { key: "X-Good", value: "ok", enabled: true },
        { key: "X-Bad", enabled: true },
        { value: "bad", enabled: true },
      ] as unknown as CustomHeader[]),
    ).toEqual({
      "X-Good": "ok",
    });
  });
});
