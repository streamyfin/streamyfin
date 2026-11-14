import type { TFunction } from "i18next";
import {
  autoBitrateFloorLabel,
  autoBitrateRatioLabel,
  autoBitrateTtlLabel,
  lastMeasureLabel,
  megabitsLabel,
} from "./autoBitrateLabels";

const t = ((key: string) => key) as unknown as TFunction;

describe("the last measure", () => {
  const tWith = ((key: string, values?: Record<string, string>) =>
    values ? `${key} ${JSON.stringify(values)}` : key) as unknown as TFunction;

  test("is the bitrate Auto streams at", () => {
    expect(lastMeasureLabel(tWith, { bitrate: 48_500_000 }, "en")).toBe(
      "48.5 Mb/s",
    );
  });

  // A failed remeasure leaves the earlier measure in use: it says both.
  test("keeps the bitrate still in use next to why the last measure failed", () => {
    expect(
      lastMeasureLabel(
        tWith,
        { bitrate: 48_500_000, failure: "the server answered 503" },
        "en",
      ),
    ).toBe(
      'home.settings.quality.last_measure_kept {"bitrate":"48.5 Mb/s","cause":"the server answered 503"}',
    );
  });

  test("says why it failed when nothing was measured before", () => {
    expect(lastMeasureLabel(tWith, { failure: "timeout" }, "en")).toBe(
      'home.settings.quality.last_measure_failed {"cause":"timeout"}',
    );
  });

  test("says when nothing was measured yet", () => {
    expect(lastMeasureLabel(tWith, {}, "en")).toBe(
      "home.settings.quality.last_measure_none",
    );
  });
});

describe("the Auto settings' labels", () => {
  test("give a share as a percentage of the language", () => {
    expect(autoBitrateRatioLabel(0.7, "en")).toBe("70%");
    expect(autoBitrateRatioLabel(0.7, "fr")).toBe("70 %");
  });

  // The inactivity timeout already names these durations, translated.
  test("name a validity by the inactivity timeout's durations", () => {
    expect(autoBitrateTtlLabel(t, 15)).toBe(
      "home.settings.security.inactivity_timeout.15_minutes",
    );
    expect(autoBitrateTtlLabel(t, 60)).toBe(
      "home.settings.security.inactivity_timeout.1_hour",
    );
    expect(autoBitrateTtlLabel(t, 1440)).toBe(
      "home.settings.security.inactivity_timeout.24_hours",
    );
  });

  test("name a floor in Mb/s, as the qualities are, and none by its word", () => {
    expect(autoBitrateFloorLabel(t, 140_000_000)).toBe("140 Mb/s");
    expect(autoBitrateFloorLabel(t, 0)).toBe(
      "home.settings.quality.in_network_min_none",
    );
  });

  test("give a measured bitrate in Mb/s, to a tenth", () => {
    expect(megabitsLabel(36_420_000, "en")).toBe("36.4 Mb/s");
    expect(megabitsLabel(140_000_000, "en")).toBe("140 Mb/s");
  });
});
