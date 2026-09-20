import { describe, expect, test } from "bun:test";
import { estimateTranscodeSize } from "./downloadSize";

// One hour, in ticks.
const HOUR = 36_000_000_000;
const sizeAt = (bitsPerSecond: number) =>
  Math.floor(((bitsPerSecond * 3600) / 8) * 1.1);

describe("estimateTranscodeSize", () => {
  test("uses the source bitrate when the quality is Max", () => {
    expect(estimateTranscodeSize(undefined, 15_000_000, HOUR)).toBe(
      sizeAt(15_000_000),
    );
  });

  test("uses the chosen bitrate when it is below the source", () => {
    expect(estimateTranscodeSize(4_000_000, 15_000_000, HOUR)).toBe(
      sizeAt(4_000_000),
    );
  });

  test("never estimates above the source bitrate", () => {
    expect(estimateTranscodeSize(8_000_000, 2_000_000, HOUR)).toBe(
      sizeAt(2_000_000),
    );
  });

  test("falls back to the chosen bitrate when the source has none", () => {
    expect(estimateTranscodeSize(4_000_000, undefined, HOUR)).toBe(
      sizeAt(4_000_000),
    );
  });

  test("gives up without any bitrate or duration", () => {
    expect(estimateTranscodeSize(undefined, undefined, HOUR)).toBeUndefined();
    expect(estimateTranscodeSize(4_000_000, 15_000_000, 0)).toBeUndefined();
  });
});
