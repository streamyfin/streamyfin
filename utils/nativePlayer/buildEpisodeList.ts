import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { TFunction } from "i18next";
import type { NativePlayerEpisodeListItem } from "@/modules/mpv-player";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { runtimeTicksToMinutes } from "@/utils/time";

export const buildEpisodeList = (
  episodes: BaseItemDto[],
  {
    api,
    currentItemId,
    t,
    locale,
  }: {
    api: Api | null;
    currentItemId?: string;
    t: TFunction;
    locale: string;
  },
): NativePlayerEpisodeListItem[] => {
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    // Jellyfin premiere dates represent a calendar day, not a local instant.
    timeZone: "UTC",
  });
  const ratingFormatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return episodes
    .filter((episode) => episode.LocationType !== "Virtual")
    .map((episode) => {
      const season = episode.ParentIndexNumber;
      const index = episode.IndexNumber;
      const numbering =
        season != null && index != null
          ? t("player.episode_details.season_episode", {
              season,
              episode: index,
            })
          : index != null
            ? t("player.episode_details.episode", { episode: index })
            : season != null
              ? t("player.episode_details.season", { season })
              : undefined;
      const premiereDate = episode.PremiereDate
        ? new Date(episode.PremiereDate)
        : undefined;
      const rating = episode.CommunityRating;
      const played = episode.UserData?.Played;
      const details = [
        numbering,
        episode.RunTimeTicks != null && episode.RunTimeTicks > 0
          ? runtimeTicksToMinutes(episode.RunTimeTicks)
          : undefined,
        premiereDate && !Number.isNaN(premiereDate.getTime())
          ? dateFormatter.format(premiereDate)
          : undefined,
        episode.OfficialRating?.trim(),
        rating != null && Number.isFinite(rating)
          ? t("player.episode_details.rating", {
              rating: ratingFormatter.format(rating),
            })
          : undefined,
        played == null
          ? undefined
          : played
            ? t("player.episode_details.watched")
            : t("player.episode_details.unwatched"),
      ]
        .filter(Boolean)
        .join(" · ");

      return {
        itemId: episode.Id ?? "",
        title: episode.Name ?? "",
        indexNumber: index ?? undefined,
        overview: episode.Overview?.trim() || undefined,
        details: details || undefined,
        imageUrl:
          getPrimaryImageUrl({ api, item: episode, quality: 80, width: 300 }) ??
          undefined,
        progressPercent: episode.UserData?.PlayedPercentage ?? 0,
        isCurrent: episode.Id === currentItemId,
      };
    });
};
