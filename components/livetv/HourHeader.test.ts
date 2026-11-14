import { guideHours } from "./HourHeader";

// The suite runs in New York's time zone (test-utils/timeZone.ts), where the
// clocks went from 2:00 to 3:00 on 8 March 2026 and back on 1 November.
describe("guideHours", () => {
  const localHours = (start: string) =>
    guideHours(new Date(start).getTime()).map((hour) => hour.getHours());

  test("runs from the first hour to midnight", () => {
    expect(localHours("2026-01-01T20:00:00")).toEqual([20, 21, 22, 23]);
  });

  test("skips the hour the clocks skip, without a second 3:00", () => {
    const hours = localHours("2026-03-08T00:00:00");
    expect(hours.slice(0, 4)).toEqual([0, 1, 3, 4]);
    expect(hours).toHaveLength(23);
  });

  test("shows the hour the clocks repeat twice", () => {
    const hours = localHours("2026-11-01T00:00:00");
    expect(hours.slice(0, 4)).toEqual([0, 1, 1, 2]);
    expect(hours).toHaveLength(25);
  });

  test("keeps one elapsed hour between cells", () => {
    const times = guideHours(new Date("2026-03-08T00:00:00").getTime()).map(
      (hour) => hour.getTime(),
    );
    expect(new Set(times.slice(1).map((t, i) => t - times[i]))).toEqual(
      new Set([3_600_000]),
    );
  });
});
