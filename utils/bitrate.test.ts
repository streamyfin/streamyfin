import type { TFunction } from "i18next";
import {
  AUTO_BITRATE,
  bitrateLabel,
  fromNativeQualityIndex,
  MAX_BITRATE,
  parseBitrateParam,
  toBitrateParam,
  toBitrateRequest,
  toDownloadBitrate,
  toNativeQualityIndex,
} from "./bitrate";

const EIGHT_MBPS = { key: "8 Mb/s", value: 8_000_000 };

describe("a quality on its way to the player", () => {
  test("stays Auto, for the player to measure", () => {
    expect(toBitrateRequest(AUTO_BITRATE)).toBe("auto");
    expect(toBitrateParam(AUTO_BITRATE)).toBe("auto");
    expect(parseBitrateParam("auto")).toBe("auto");
  });

  test("carries no cap for Max", () => {
    expect(toBitrateRequest(MAX_BITRATE)).toBeUndefined();
    expect(toBitrateParam(MAX_BITRATE)).toBe("");
    expect(parseBitrateParam("")).toBeUndefined();
  });

  test("carries a fixed quality in bit/s", () => {
    expect(toBitrateRequest(EIGHT_MBPS)).toBe(8_000_000);
    expect(parseBitrateParam(toBitrateParam(EIGHT_MBPS))).toBe(8_000_000);
  });

  test("is read as no cap when the route holds no number", () => {
    expect(parseBitrateParam(undefined)).toBeUndefined();
    expect(parseBitrateParam("Max")).toBeUndefined();
  });

  // The native player hands back the index of the entry picked, and keeps -1
  // for Max: Auto needs one of its own to come back as Auto.
  test("tells Auto from Max in the native player's quality menu", () => {
    expect(toNativeQualityIndex("auto")).toBe(-2);
    expect(toNativeQualityIndex(undefined)).toBe(-1);
    expect(toNativeQualityIndex(8_000_000)).toBe(8_000_000);
    expect(fromNativeQualityIndex(-2)).toBe("auto");
    expect(fromNativeQualityIndex(-1)).toBeUndefined();
    expect(fromNativeQualityIndex(8_000_000)).toBe(8_000_000);
  });
});

describe("a download", () => {
  // A file has no connection to adapt to.
  test("is made at Max when the quality is Auto", () => {
    expect(toDownloadBitrate(AUTO_BITRATE)).toEqual({
      key: "Max",
      value: undefined,
    });
  });

  test("keeps any other quality", () => {
    expect(toDownloadBitrate(EIGHT_MBPS)).toBe(EIGHT_MBPS);
    expect(toDownloadBitrate(MAX_BITRATE)).toBe(MAX_BITRATE);
  });
});

describe("bitrateLabel", () => {
  const t = ((key: string) => `translated:${key}`) as TFunction;

  test("names Auto in the app language", () => {
    expect(bitrateLabel(t, AUTO_BITRATE)).toBe(
      "translated:item_card.quality_auto",
    );
  });

  test("names the other qualities by their key", () => {
    expect(bitrateLabel(t, MAX_BITRATE)).toBe("Max");
    expect(bitrateLabel(t, EIGHT_MBPS)).toBe("8 Mb/s");
  });
});
