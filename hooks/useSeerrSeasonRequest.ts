import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrPublicSettings } from "@/hooks/useSeerrPublicSettings";
import { hasPermission, Permission } from "@/utils/seerr/permissions";
import {
  roomForAll,
  roomForOneMore,
  seasonRows,
  selectsAll,
  toggleAllSeasons,
  toggleSeason,
  unrequestedSeasons,
  withinQuota,
} from "@/utils/seerr/seasons";
import type { TvDetails } from "@/utils/seerr/types";

/**
 * The seasons of a series to request, as Seerr's own modal has them
 * (TvRequestModal), for the phone's sheet and the TV's alike: which seasons
 * show and which can still be asked for, what is chosen, the quota of whoever
 * the request is for, and what the request button says and allows.
 */
export const useSeerrSeasonRequest = ({
  details,
  enabled,
  opened,
  quotaUserId,
}: {
  details?: TvDetails;
  /** False for a film: nothing to choose. */
  enabled: boolean;
  /**
   * The request the sheet opens with, whose seasons start switched on: none
   * from the request button, as on Seerr. A new one starts the switches over.
   */
  opened?: { seasons?: number[] | "all" };
  /** Whose quota counts: the user's own, or the one picked in Request as. */
  quotaUserId?: number;
}) => {
  const { t } = useTranslation();
  const { seerrApi, seerrUser } = useSeerr();

  // What Seerr's own modal reads from the server: whether it shows the
  // specials, and whether it takes a series a season at a time.
  const publicSettings = useSeerrPublicSettings();
  const specials = publicSettings?.enableSpecialEpisodes === true;
  const partial = publicSettings?.partialRequestsEnabled !== false;

  const rows = useMemo(
    () => (enabled && details ? seasonRows(details, { specials }) : []),
    [enabled, details, specials],
  );
  const unrequested = useMemo(
    () => (enabled && details ? unrequestedSeasons(details, { specials }) : []),
    [enabled, details, specials],
  );
  const [selected, setSelected] = useState<number[]>([]);

  // The switches start from what the sheet was opened with.
  useEffect(() => {
    const initial = opened?.seasons ?? [];
    setSelected(
      initial === "all"
        ? unrequested
        : initial.filter((season) => unrequested.includes(season)),
    );
  }, [opened, unrequested]);

  const { data: quota, isLoading: quotaLoading } = useQuery({
    queryKey: ["seerr", "quota", quotaUserId],
    queryFn: async () => seerrApi?.userQuota(quotaUserId!),
    enabled: enabled && !!seerrApi && quotaUserId !== undefined,
  });
  const tvQuota = quota?.tv;
  const limited = !!tvQuota?.limit;
  // A server that only takes whole series needs a quota for all of them.
  const overLimit =
    limited && !partial && unrequested.length > (tvQuota?.remaining ?? 0);
  // Seasons chosen before another user was picked in Request as can go past
  // that user's quota, which Seerr refuses.
  const overQuota = enabled && partial && !withinQuota(selected, tvQuota);
  const remaining =
    overLimit || overQuota ? 0 : (tvQuota?.remaining ?? 0) - selected.length;

  // What the button for all seasons does, and so what it says.
  const selecting = selectsAll(selected, unrequested);

  return {
    specials,
    partial,
    rows,
    unrequested,
    selected,
    toggle: (seasonNumber: number) =>
      setSelected((current) =>
        toggleSeason(current, seasonNumber, unrequested, tvQuota),
      ),
    toggleAll: () =>
      setSelected((current) => toggleAllSeasons(current, unrequested, tvQuota)),
    selecting,
    // Clearing is always possible, selecting them all only within the quota.
    canToggleAll: !selecting || roomForAll(unrequested, tvQuota),
    roomForOneMore: roomForOneMore(selected, tvQuota),
    tvQuota,
    limited,
    overLimit,
    overQuota,
    remaining,
    approvedAutomatically:
      enabled &&
      unrequested.length > 0 &&
      !overLimit &&
      hasPermission(
        [
          Permission.MANAGE_REQUESTS,
          Permission.AUTO_APPROVE,
          Permission.AUTO_APPROVE_TV,
        ],
        seerrUser?.permissions ?? 0,
        { type: "or" },
      ),
    // A server that only takes whole series gets every season left.
    seasons: [...(partial ? selected : unrequested)].sort((a, b) => a - b),
    // Seerr's button: nothing left to ask for, the whole series, nothing
    // chosen yet, or how many seasons.
    label:
      unrequested.length === 0
        ? t("seerr.already_requested")
        : !partial
          ? t("seerr.request_button")
          : selected.length === 0
            ? t("seerr.select_seasons")
            : t("seerr.request_n_seasons", { count: selected.length }),
    // A whole series that the quota left cannot cover would be refused by
    // Seerr, so the button stays off (Seerr's own compares with the limit).
    // Also while the quota of the user picked is on its way.
    blocked:
      quotaLoading ||
      overLimit ||
      overQuota ||
      unrequested.length === 0 ||
      (partial && selected.length === 0),
  };
};
