import type { TFunction } from "i18next";
import {
  AUTO_BITRATE,
  bitrateLabel,
  fromNativeQualityIndex,
  liveTvBitrateRequest,
  MAX_BITRATE,
  parseBitrateParam,
  routeBitrateParam,
  toBitrateParam,
  toBitrateRequest,
  toDownloadBitrate,
  toNativeQualityIndex,
  withDefaultBitrate,
} from "./bitrate";

const EIGHT_MBPS = { key: "8 Mb/s", value: 8_000_000 };

describe("a quality on its way to the player", () => {
  test("stays Auto, for the player to measure", () => {
    expect(toBitrateRequest(AUTO_BITRATE)).toBe("auto");
    expect(toBitrateParam(AUTO_BITRATE)).toBe("auto");
    expect(parseBitrateParam("auto")).toBe("auto");
  });

  // Saying nothing now asks for the default quality, so no cap is said.
  test("says Max, which sets no cap", () => {
    expect(toBitrateRequest(MAX_BITRATE)).toBe("max");
    expect(toBitrateParam(MAX_BITRATE)).toBe("max");
    expect(parseBitrateParam("max")).toBe("max");
  });

  test("carries a fixed quality in bit/s", () => {
    expect(toBitrateRequest(EIGHT_MBPS)).toBe(8_000_000);
    expect(parseBitrateParam(toBitrateParam(EIGHT_MBPS))).toBe(8_000_000);
  });

  test("is left to the default when the route names none", () => {
    expect(parseBitrateParam("")).toBeUndefined();
    expect(parseBitrateParam(undefined)).toBeUndefined();
    expect(parseBitrateParam("Max")).toBeUndefined();
  });

  // The native player hands back the index of the entry picked, and keeps -1
  // for Max: Auto needs one of its own to come back as Auto.
  test("tells Auto from Max in the native player's quality menu", () => {
    expect(toNativeQualityIndex("auto")).toBe(-2);
    expect(toNativeQualityIndex("max")).toBe(-1);
    expect(toNativeQualityIndex(8_000_000)).toBe(8_000_000);
    expect(fromNativeQualityIndex(-2)).toBe("auto");
    expect(fromNativeQualityIndex(-1)).toBe("max");
    expect(fromNativeQualityIndex(8_000_000)).toBe(8_000_000);
  });
});

// A Play command from another client, a Top Shelf tile and a SyncPlay group
// start an item without a quality.
describe("a playback that names no quality", () => {
  test("plays at the default one", () => {
    expect(withDefaultBitrate(undefined, AUTO_BITRATE)).toBe("auto");
    expect(withDefaultBitrate(undefined, MAX_BITRATE)).toBe("max");
    expect(withDefaultBitrate(undefined, EIGHT_MBPS)).toBe(8_000_000);
  });

  test("plays at Auto, the app's default, before the settings are read", () => {
    expect(withDefaultBitrate(undefined, undefined)).toBe("auto");
  });

  test("leaves a quality that is named as it is", () => {
    expect(withDefaultBitrate("max", AUTO_BITRATE)).toBe("max");
    expect(withDefaultBitrate("auto", MAX_BITRATE)).toBe("auto");
    expect(withDefaultBitrate(4_000_000, AUTO_BITRATE)).toBe(4_000_000);
  });

  // The players' quality menus read the route: one that names no quality
  // marks the default.
  test("is marked at the default quality in the player's menu", () => {
    expect(routeBitrateParam("", AUTO_BITRATE)).toBe("auto");
    expect(routeBitrateParam(undefined, EIGHT_MBPS)).toBe("8000000");
    expect(routeBitrateParam("max", AUTO_BITRATE)).toBe("max");
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

describe("liveTvBitrateRequest", () => {
  const channel = { Type: "TvChannel" };
  const program = { Type: "Program" };
  const movie = { Type: "Movie" };

  // The guide and the channel grid play Live TV without a cap: Auto never
  // measures for it, and no quality given means the default, so Auto too.
  test("plays live television without a cap under Auto or no quality", () => {
    expect(liveTvBitrateRequest(channel, "auto")).toBe("max");
    expect(liveTvBitrateRequest(program, undefined)).toBe("max");
  });

  test("keeps a bitrate picked by hand for live television", () => {
    expect(liveTvBitrateRequest(channel, 4_000_000)).toBe(4_000_000);
  });

  test("leaves anything but live television as it is", () => {
    expect(liveTvBitrateRequest(movie, "auto")).toBe("auto");
    expect(liveTvBitrateRequest(undefined, undefined)).toBeUndefined();
  });
});
