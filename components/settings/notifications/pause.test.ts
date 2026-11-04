import { pauseState, pauseUntilText } from "./pause";

const now = new Date("2026-10-07T01:00:00Z");

describe("a pause, as the screen shows it", () => {
  test("is no pause when there is none", () => {
    expect(pauseState(null, now)).toEqual({ paused: false, until: null });
  });

  // The server keeps a pause after it ends; it no longer holds anything back.
  test("is no pause once it has ended", () => {
    expect(pauseState({ until: "2026-10-06T22:00:00Z" }, now).paused).toBe(
      false,
    );
  });

  test("lasts until turned back on when it has no end", () => {
    expect(pauseState({}, now)).toEqual({ paused: true, until: null });
    expect(pauseState({ until: null }, now)).toEqual({
      paused: true,
      until: null,
    });
  });

  test("ends at a time today", () => {
    const { paused, until } = pauseState(
      { until: "2026-10-07T05:30:00Z" },
      now,
    );

    expect(paused).toBe(true);
    expect(pauseUntilText(until!, now, "en-GB", "UTC")).toBe("05:30");
  });

  // A pause can last a day, and a time alone would read as today.
  test("names the day when it ends on another one", () => {
    const text = pauseUntilText(
      new Date("2026-10-08T09:00:00Z"),
      now,
      "en-GB",
      "UTC",
    );

    expect(text).toContain("Thu");
    expect(text).toContain("09:00");
  });
});
