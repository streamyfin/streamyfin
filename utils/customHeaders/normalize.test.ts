import { describe, expect, test } from "bun:test";
import { normalizeCustomHeaders, usableCustomHeaders } from "./normalize";

describe("normalizeCustomHeaders", () => {
  test("keeps enabled headers and trims them", () => {
    expect(
      normalizeCustomHeaders([
        { key: " CF-Access-Client-Id ", value: " id-value ", enabled: true },
      ]),
    ).toEqual({ "CF-Access-Client-Id": "id-value" });
  });

  test("drops disabled, blank and value-less headers", () => {
    expect(
      normalizeCustomHeaders([
        { key: "X-Disabled", value: "value", enabled: false },
        { key: "   ", value: "value", enabled: true },
        { key: "X-Empty", value: "   ", enabled: true },
      ]),
    ).toEqual({});
  });

  test("drops malformed names and control characters in values", () => {
    expect(
      normalizeCustomHeaders([
        { key: "Bad Header", value: "value", enabled: true },
        { key: "X-Injected", value: "value\r\nX-Other: 1", enabled: true },
      ]),
    ).toEqual({});
  });

  test("drops session headers so the Jellyfin credentials survive", () => {
    expect(
      normalizeCustomHeaders([
        { key: "authorization", value: "Basic abc", enabled: true },
        { key: "X-Emby-Token", value: "abc", enabled: true },
        { key: "X-Emby-Authorization", value: "abc", enabled: true },
        { key: "X-Kept", value: "1", enabled: true },
      ]),
    ).toEqual({ "X-Kept": "1" });
  });

  test("keeps the first of case-insensitively duplicated names", () => {
    expect(
      normalizeCustomHeaders([
        { key: "X-Token", value: "first", enabled: true },
        { key: "x-token", value: "second", enabled: true },
      ]),
    ).toEqual({ "X-Token": "first" });
  });

  test("tolerates missing and malformed stored entries", () => {
    expect(
      normalizeCustomHeaders([
        null as never,
        { key: 1 as never, value: "v", enabled: true },
        { key: "X-Ok", value: 2 as never, enabled: true },
      ]),
    ).toEqual({});
    expect(normalizeCustomHeaders(undefined)).toEqual({});
    expect(normalizeCustomHeaders(null)).toEqual({});
  });
});

describe("usableCustomHeaders", () => {
  test("keeps only the rows that would be sent", () => {
    const rows = [
      { key: "CF-Access-Client-Id", value: "id", enabled: true },
      { key: "CF-Access-Client-Secret", value: "", enabled: true },
      { key: "X-Disabled", value: "value", enabled: false },
    ];

    expect(usableCustomHeaders(rows)).toEqual([rows[0]]);
  });

  test("keeps the first row of a duplicated name, matching what is sent", () => {
    const rows = [
      { key: "X-Token", value: "first", enabled: true },
      { key: "x-token", value: "second", enabled: true },
      { key: " X-Token ", value: "third", enabled: true },
    ];

    expect(usableCustomHeaders(rows)).toEqual([rows[0]]);
  });

  test("returns nothing for an empty editor", () => {
    expect(usableCustomHeaders([])).toEqual([]);
    expect(usableCustomHeaders(undefined)).toEqual([]);
  });
});
