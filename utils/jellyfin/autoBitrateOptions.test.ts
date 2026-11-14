import { autoBitrateOptions } from "./autoBitrateOptions";

describe("autoBitrateOptions", () => {
  test("reads the share, the validity in minutes and the floor of the settings", () => {
    expect(
      autoBitrateOptions({
        autoBitrateRatio: 0.5,
        autoBitrateTtlMinutes: 15,
        autoBitrateInNetworkMin: 0,
      }),
    ).toEqual({ ratio: 0.5, ttlMs: 15 * 60_000, inNetworkMinBitrate: 0 });
  });

  test("falls back to jellyfin-web's choices for settings saved before them", () => {
    expect(autoBitrateOptions({})).toEqual({
      ratio: 0.7,
      ttlMs: 60 * 60_000,
      inNetworkMinBitrate: 140_000_000,
    });
    expect(autoBitrateOptions(undefined)).toEqual(autoBitrateOptions({}));
  });
});
