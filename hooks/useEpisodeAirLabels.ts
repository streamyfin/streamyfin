import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  airDayOffset,
  episodeAvailability,
  formatAirDay,
  formatAirTime,
} from "@/utils/upcomingEpisodes";

/** How an episode's air day, air time and missing file are worded. */
export const useEpisodeAirLabels = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n?.language;

  return useMemo(() => {
    const now = new Date();
    return {
      /** "Today", "Tomorrow", or the day written out. */
      dayLabel: (day: string): string => {
        const offset = airDayOffset(day, now);
        if (offset === -1) return t("upcoming.yesterday");
        if (offset === 0) return t("upcoming.today");
        if (offset === 1) return t("upcoming.tomorrow");
        return formatAirDay(day, locale);
      },
      // No language: 12 or 24 hours is the device's setting, not the app's.
      timeLabel: (item: BaseItemDto): string | null =>
        formatAirTime(item.AirTime),
      /** Set for an episode without a file, so it does not look playable. */
      availabilityLabel: (item?: BaseItemDto | null): string | null => {
        const availability = episodeAvailability(item, now);
        if (availability === "unaired") return t("item_card.not_yet_aired");
        if (availability === "missing") return t("item_card.missing");
        return null;
      },
    };
  }, [t, locale]);
};
