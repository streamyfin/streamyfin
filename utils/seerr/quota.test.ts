import { quotaFill, quotaPeriod } from "./quota";

// How much of a series quota the bar shows as spent, the seasons switched on
// included (they are already taken off `remaining`).
describe("quotaFill", () => {
  test("shows nothing spent without a limit", () => {
    expect(quotaFill(undefined, undefined)).toBe(0);
    expect(quotaFill(0, 5)).toBe(0);
  });

  test("shows the part of the limit already used", () => {
    expect(quotaFill(3, 2)).toBeCloseTo(1 / 3);
    expect(quotaFill(3, 0)).toBe(1);
  });

  test("stays within the bar when the numbers overshoot", () => {
    expect(quotaFill(3, -1)).toBe(1);
    expect(quotaFill(3, 5)).toBe(0);
  });
});

// Over what a quota counts, as Seerr's QuotaDisplay words it: 0 days counts
// every request ever made (User.getQuota filters no date), 1 is every day.
describe("quotaPeriod", () => {
  test("counts every request ever made over 0 days", () => {
    expect(quotaPeriod(0)).toBe("total");
  });

  test("counts a day at a time over 1 day", () => {
    expect(quotaPeriod(1)).toBe("daily");
  });

  test("counts over the days set otherwise", () => {
    expect(quotaPeriod(7)).toBe("days");
  });

  test("has no period to tell without its days", () => {
    expect(quotaPeriod(undefined)).toBeUndefined();
  });
});
