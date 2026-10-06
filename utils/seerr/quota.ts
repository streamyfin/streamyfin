/**
 * The share of a quota the bar shows as spent, between 0 and 1: what the
 * user has used, plus the seasons switched on, which are already taken off
 * `remaining`. No limit, nothing to show.
 */
export const quotaFill = (limit?: number, remaining?: number): number => {
  if (!limit) return 0;
  const used = (limit - (remaining ?? 0)) / limit;
  return Math.min(1, Math.max(0, used));
};

/**
 * Over what a quota counts, for its wording: every request ever made when it
 * has 0 days (Seerr then filters no date), a day at a time, or its days.
 */
export const quotaPeriod = (
  days?: number,
): "total" | "daily" | "days" | undefined => {
  if (days === undefined) return undefined;
  if (days === 0) return "total";
  return days === 1 ? "daily" : "days";
};

/** The translation function, as i18next's `t` is called here. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * The words of a series quota (Seerr's QuotaDisplay), for the phone's sheet
 * and the TV's alike: how many season requests are left, over what period,
 * and, when the seasons a request needs do not fit, how many it needs.
 */
export const seasonQuotaText = (
  t: Translate,
  {
    remaining,
    limit,
    days,
    overLimit,
  }: { remaining: number; limit?: number; days?: number; overLimit?: number },
): { status: string; period?: string; required?: string } => {
  const period = quotaPeriod(days);
  return {
    status:
      overLimit !== undefined
        ? t("seerr.quota.not_enough_season_requests")
        : remaining <= 0
          ? t("seerr.quota.no_season_requests_remaining")
          : t("seerr.quota.season_requests_remaining", { count: remaining }),
    period:
      limit === undefined || !period
        ? undefined
        : period === "total"
          ? t("seerr.quota.season_limit_total", { count: limit })
          : period === "daily"
            ? t("seerr.quota.season_limit_daily", { count: limit })
            : t("seerr.quota.season_limit", { count: limit, days }),
    required:
      overLimit === undefined
        ? undefined
        : t("seerr.quota.required_season_requests", { count: overLimit }),
  };
};
