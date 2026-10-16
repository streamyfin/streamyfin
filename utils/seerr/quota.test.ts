import { quotaFill, quotaPeriod, seasonQuotaText } from "./quota";

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

// The words of a series quota, the phone's sheet and the TV's alike.
describe("seasonQuotaText", () => {
  const t = (key: string, options?: Record<string, unknown>) =>
    options ? `${key} ${JSON.stringify(options)}` : key;

  test("says how many season requests are left, and over what", () => {
    expect(seasonQuotaText(t, { remaining: 2, limit: 8, days: 7 })).toEqual({
      status: 'seerr.quota.season_requests_remaining {"count":2}',
      period: 'seerr.quota.season_limit {"count":8,"days":7}',
      required: undefined,
    });
  });

  test("words a day's quota and one that never resets", () => {
    expect(seasonQuotaText(t, { remaining: 1, limit: 3, days: 1 }).period).toBe(
      'seerr.quota.season_limit_daily {"count":3}',
    );
    expect(seasonQuotaText(t, { remaining: 1, limit: 3, days: 0 }).period).toBe(
      'seerr.quota.season_limit_total {"count":3}',
    );
  });

  test("says none are left once it is spent", () => {
    expect(seasonQuotaText(t, { remaining: 0, limit: 3, days: 7 }).status).toBe(
      "seerr.quota.no_season_requests_remaining",
    );
  });

  test("says when the seasons a request needs do not fit", () => {
    expect(
      seasonQuotaText(t, { remaining: 0, limit: 3, days: 7, overLimit: 5 }),
    ).toEqual({
      status: "seerr.quota.not_enough_season_requests",
      period: 'seerr.quota.season_limit {"count":3,"days":7}',
      required: 'seerr.quota.required_season_requests {"count":5}',
    });
  });
});
