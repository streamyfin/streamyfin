import { describe, expect, test } from "bun:test";
import {
  estimateDownloadActivitySize,
  estimateTranscodeSize,
} from "./downloadSize";

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

describe("download Live Activity totals", () => {
  test("direct downloads do not acquire an estimated completion total", () => {
    for (const TranscodingUrl of [undefined, null, ""]) {
      const source = { Bitrate: 4_000_000, TranscodingUrl };
      expect(
        estimateDownloadActivitySize(source, undefined, HOUR),
      ).toBeUndefined();
      expect(
        estimateDownloadActivitySize(source, 2_000_000, HOUR),
      ).toBeUndefined();
    }
  });

  test("transcoded downloads at Max still use the source bitrate", () => {
    expect(
      estimateDownloadActivitySize(
        { Bitrate: 4_000_000, TranscodingUrl: "/Videos/movie/stream.mp4" },
        undefined,
        HOUR,
      ),
    ).toBe(sizeAt(4_000_000));
  });

  test("transcoded downloads respect a lower chosen bitrate", () => {
    expect(
      estimateDownloadActivitySize(
        { Bitrate: 4_000_000, TranscodingUrl: "/Videos/movie/stream.mp4" },
        2_000_000,
        HOUR,
      ),
    ).toBe(sizeAt(2_000_000));
  });
});
