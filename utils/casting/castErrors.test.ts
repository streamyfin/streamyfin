import { describe, expect, test } from "bun:test";
import { isLoadFailedError } from "./castErrors";

describe("isLoadFailedError", () => {
  test("recognises a status 2100 error message", () => {
    const error = new Error(
      "java.lang.Exception: Media control channel status code 2100",
    );
    expect(isLoadFailedError(error)).toBe(true);
  });

  test("returns false for unrelated errors", () => {
    expect(isLoadFailedError(new Error("network timeout"))).toBe(false);
  });

  test("handles non-Error values without throwing", () => {
    expect(isLoadFailedError("status code 2100")).toBe(true);
    expect(isLoadFailedError(null)).toBe(false);
  });
});
