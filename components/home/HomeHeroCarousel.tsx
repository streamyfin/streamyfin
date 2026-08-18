import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  BaseItemKind,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  getItemsApi,
  getTvShowsApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useSegments } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWindowDimensions } from "react-native";
import useRouter from "@/hooks/useAppRouter";
import { useHaptic } from "@/hooks/useHaptic";
import { useHeadersForUrl } from "@/hooks/useHeadersForUrl";
import {
  type HeroCarouselFilterSection,
  type HeroCarouselFilterToggleEvent,
  type HeroCarouselItem,
  type HeroCarouselItemPressEvent,
  HeroCarouselView,
  isHeroCarouselAvailable,
} from "@/modules";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  type HomeHeroMediaType,
  type HomeHeroSection,
  useSettings,
} from "@/utils/atoms/settings";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import { getParentBackdropImageUrl } from "@/utils/jellyfin/image/getParentBackdropImageUrl";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { runtimeTicksToMinutes } from "@/utils/time";
import { getItemNavigation } from "../common/TouchableItemRouter";

// Space the native view reserves under the cards for the page dots.
const DOTS_AREA = 24;

/**
 * Card geometry for the current window width. Derived per render rather than
 * once at import: on iPad the width changes with rotation and Split View.
 */
const heroMetrics = (windowWidth: number) => {
  // Matches the 36pt page margin inside the native view.
  const cardWidth = Math.max(windowWidth - 72, 1);
  return {
    cardHeight: Math.round(Math.min(cardWidth * 1.15, 440)),
    backdropWidth: Math.min(Math.round(cardWidth * 2), 1920),
  };
};

const IMAGE_TYPES = ["Primary", "Backdrop", "Logo", "Thumb"] as const;

type HeroSection = HomeHeroSection;

/** The carousel always aims for this many slides, whatever is filtered out. */
const HERO_TARGET_COUNT = 10;

/**
 * Relative share of the carousel each group gets when everything is enabled:
 * 2 continue-watching, 2 next-up, 6 recently added (3 movies + 3 TV).
 * Disabling a group redistributes its share across the ones that remain, in
 * proportion to these weights, rather than simply shortening the carousel.
 */
const GROUP_WEIGHTS: Record<HeroSection, number> = {
  continueWatching: 2,
  nextUp: 2,
  recentlyAdded: 6,
};

/**
 * Splits `total` across the given weights so the parts sum to exactly
 * `total` (largest-remainder apportionment). Entries are passed in priority
 * order, which is how remainder ties are broken.
 */
const apportion = <K extends string>(
  total: number,
  weights: [K, number][],
): Record<K, number> => {
  const sum = weights.reduce((acc, [, weight]) => acc + weight, 0);
  const result = {} as Record<K, number>;
  if (sum <= 0) {
    for (const [key] of weights) result[key] = 0;
    return result;
  }

  const remainders: { key: K; remainder: number }[] = [];
  let assigned = 0;
  for (const [key, weight] of weights) {
    const exact = (total * weight) / sum;
    const floor = Math.floor(exact);
    result[key] = floor;
    assigned += floor;
    remainders.push({ key, remainder: exact - floor });
  }

  // Hand out what rounding left over, biggest fractional part first. Sort is
  // stable, so equal remainders fall to whichever came first in `weights`.
  const leftover = total - assigned;
  remainders
    .sort((a, b) => b.remainder - a.remainder)
    .slice(0, Math.max(leftover, 0))
    .forEach(({ key }) => {
      result[key] += 1;
    });
  return result;
};

/**
 * How many items to request for a quota of `n`. Dedup (same item or same
 * series across groups) eats candidates, and the leftovers are what backfill
 * a bucket that comes up short, so every bucket fetches spare capacity.
 */
const overFetch = (quota: number) =>
  quota <= 0 ? 0 : Math.min(quota * 2 + 4, HERO_TARGET_COUNT * 2);

const SECTION_LABEL_KEYS: Record<HeroSection, string> = {
  continueWatching: "home.continue_watching",
  nextUp: "home.next_up",
  recentlyAdded: "home.recently_added",
};

const SECTION_ICONS: Record<HeroSection, string> = {
  continueWatching: "play.fill",
  nextUp: "forward.fill",
  recentlyAdded: "sparkles",
};

type HeroEntry = { item: BaseItemDto; section: HeroSection };

/** Menu row keys, namespaced so one event handler can route every row. */
const SECTION_KEY_PREFIX = "section:";
const MEDIA_KEY_PREFIX = "media:";
/** Turns the whole hero off; also lives in the app's appearance settings. */
const VISIBILITY_KEY = "visibility:hero";

const ALL_SECTIONS: HomeHeroSection[] = [
  "continueWatching",
  "nextUp",
  "recentlyAdded",
];
const ALL_MEDIA_TYPES: HomeHeroMediaType[] = ["movie", "tv"];

const MEDIA_LABEL_KEYS: Record<HomeHeroMediaType, string> = {
  movie: "common.movies",
  tv: "home.hero.tv_shows",
};

const toggleHidden = <T extends string>(hidden: T[], value: T): T[] =>
  hidden.includes(value)
    ? hidden.filter((entry) => entry !== value)
    : [...hidden, value];

/**
 * Which slide sources survive a filter state. Shared by the query and by the
 * menu's guard so the two can't drift apart.
 */
const resolveSources = (
  hiddenSections: HomeHeroSection[],
  hiddenMediaTypes: HomeHeroMediaType[],
) => {
  const showMovies = !hiddenMediaTypes.includes("movie");
  const showTv = !hiddenMediaTypes.includes("tv");
  const showContinueWatching =
    !hiddenSections.includes("continueWatching") && (showMovies || showTv);
  // Next up is episodes only, so it disappears with the TV media type.
  const showNextUp = !hiddenSections.includes("nextUp") && showTv;
  const showRecentlyAdded =
    !hiddenSections.includes("recentlyAdded") && (showMovies || showTv);
  return {
    showMovies,
    showTv,
    showContinueWatching,
    showNextUp,
    showRecentlyAdded,
  };
};

/**
 * Whether a filter state leaves anything to show. The two hidden-lists have
 * to be judged together, not one at a time: Next Up is episodes-only, so
 * hiding the other two groups and then hiding TV silences every source even
 * though each of those toggles is legal on its own. An empty carousel takes
 * the filter menu down with it, so such a combination is refused.
 */
const hasAnySource = (
  hiddenSections: HomeHeroSection[],
  hiddenMediaTypes: HomeHeroMediaType[],
): boolean => {
  const sources = resolveSources(hiddenSections, hiddenMediaTypes);
  return (
    sources.showContinueWatching ||
    sources.showNextUp ||
    sources.showRecentlyAdded
  );
};

const isTvChild = (item: BaseItemDto) =>
  item.Type === "Episode" || item.Type === "Season";

/** Everything that isn't a movie is TV (Series, Season, Episode). */
const mediaTypeOf = (item: BaseItemDto): HomeHeroMediaType =>
  item.Type === "Movie" ? "movie" : "tv";

const buildSubtitle = (item: BaseItemDto): string | null => {
  if (item.Type === "Episode") {
    const season = item.ParentIndexNumber;
    const episode = item.IndexNumber;
    const code =
      season != null && episode != null ? `S${season}E${episode}` : null;
    if (code && item.Name) return `${code} · ${item.Name}`;
    return item.Name || code;
  }
  if (item.Type === "Season") return item.Name || null;
  return null;
};

const buildBackdropUrl = (
  api: Api,
  item: BaseItemDto,
  width: number,
): string | null => {
  // Episodes/seasons: prefer the series backdrop over the episode still.
  if (
    isTvChild(item) &&
    item.ParentBackdropItemId &&
    item.ParentBackdropImageTags?.length
  ) {
    return getParentBackdropImageUrl({ api, item, quality: 80, width });
  }
  return getBackdropUrl({ api, item, quality: 80, width });
};

const buildLogoUrl = (api: Api, item: BaseItemDto): string | null => {
  // Handles the item's own logo and the Episode → parent logo case.
  const own = getLogoImageUrlById({ api, item, height: 120 });
  if (own) return own;
  // Seasons carry the series logo only through the Parent* fields.
  if (item.ParentLogoItemId && item.ParentLogoImageTag) {
    const params = new URLSearchParams({
      tag: item.ParentLogoImageTag,
      quality: "90",
      fillHeight: "120",
    });
    return `${api.basePath}/Items/${item.ParentLogoItemId}/Images/Logo?${params.toString()}`;
  }
  return null;
};

const buildPosterUrl = (api: Api, item: BaseItemDto): string | null => {
  // An episode's Primary is a 16:9 still that crops badly in the portrait
  // thumb slot; use the series poster instead.
  if (item.Type === "Episode" && item.SeriesId && item.SeriesPrimaryImageTag) {
    const params = new URLSearchParams({
      tag: item.SeriesPrimaryImageTag,
      quality: "90",
      fillWidth: "240",
    });
    return `${api.basePath}/Items/${item.SeriesId}/Images/Primary?${params.toString()}`;
  }
  return getPrimaryImageUrl({ api, item, width: 240 });
};

const buildBadges = (item: BaseItemDto): string[] => {
  const badges: string[] = [];
  if (item.ProductionYear) badges.push(String(item.ProductionYear));
  if (item.OfficialRating) badges.push(item.OfficialRating);
  if (item.RunTimeTicks) badges.push(runtimeTicksToMinutes(item.RunTimeTicks));
  return badges;
};

/**
 * Native hero carousel at the top of the home tab. All data (image URLs,
 * localized labels and badges) is prepared here — the native view is purely
 * presentational. Renders nothing on platforms without the native module.
 *
 * Two independent filters narrow the slides, both driven by settings and
 * both "hidden" lists so the default (empty) shows everything:
 * `hiddenHomeHeroSections` drops a whole group, `hiddenHomeHeroMediaTypes`
 * drops movies or TV across every group. A group whose content is entirely
 * filtered out is never requested from the server.
 *
 * The carousel keeps its length at {@link HERO_TARGET_COUNT} regardless: a
 * filtered-out group's share is reapportioned over whatever remains, and it
 * lands where the filter implies. Hiding movies pushes the recently-added
 * share entirely onto TV; hiding next-up grows continue-watching and
 * recently-added together. Anything still short after that (dedup, a thin
 * library) is backfilled from the buckets that have candidates to spare.
 */
export const HomeHeroCarousel = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const router = useRouter();
  const { t } = useTranslation();
  const { settings, updateSettings, pluginSettings } = useSettings();
  const lightHapticFeedback = useHaptic("light");
  const { width: windowWidth } = useWindowDimensions();
  const metrics = useMemo(() => heroMetrics(windowWidth), [windowWidth]);
  const segments = useSegments();
  const from = (segments as string[])[2] || "(home)";
  const imageHeaders = useHeadersForUrl(api?.basePath);

  const hiddenSections = settings?.hiddenHomeHeroSections;
  const hiddenMediaTypes = settings?.hiddenHomeHeroMediaTypes;
  // `settings` starts empty before the stored values load; default to on so
  // the hero doesn't flash out of existence on a cold start.
  const showHeroCarousel = settings?.showHeroCarousel !== false;

  const filters = useMemo(() => {
    const {
      showMovies,
      showTv,
      showContinueWatching,
      showNextUp,
      showRecentlyAdded,
    } = resolveSources(hiddenSections ?? [], hiddenMediaTypes ?? []);

    // Share out the target length over the groups still standing, then split
    // the recently-added share over the media types still standing.
    const groupQuota = apportion(
      HERO_TARGET_COUNT,
      (
        [
          ["continueWatching", showContinueWatching],
          ["nextUp", showNextUp],
          ["recentlyAdded", showRecentlyAdded],
        ] as [HeroSection, boolean][]
      )
        .filter(([, enabled]) => enabled)
        .map(([section]) => [section, GROUP_WEIGHTS[section]]),
    );

    const mediaQuota = apportion(
      groupQuota.recentlyAdded ?? 0,
      (
        [
          ["movie", showMovies],
          ["tv", showTv],
        ] as [HomeHeroMediaType, boolean][]
      )
        .filter(([, enabled]) => enabled)
        .map(([mediaType]) => [mediaType, 1]),
    );

    return {
      showMovies,
      showTv,
      showContinueWatching,
      showNextUp,
      showRecentlyAddedMovies: showRecentlyAdded && showMovies,
      showRecentlyAddedTv: showRecentlyAdded && showTv,
      continueWatchingQuota: groupQuota.continueWatching ?? 0,
      nextUpQuota: groupQuota.nextUp ?? 0,
      recentlyAddedMovieQuota: mediaQuota.movie ?? 0,
      recentlyAddedTvQuota: mediaQuota.tv ?? 0,
    };
  }, [hiddenSections, hiddenMediaTypes]);

  const { data: entries } = useQuery({
    queryKey: [
      "home",
      "heroCarousel",
      user?.Id,
      hiddenSections?.join(",") ?? "",
      hiddenMediaTypes?.join(",") ?? "",
    ],
    queryFn: async (): Promise<HeroEntry[]> => {
      if (!api || !user?.Id) return [];

      const resumeTypes: BaseItemKind[] = [
        ...(filters.showMovies ? (["Movie"] as const) : []),
        ...(filters.showTv ? (["Series", "Episode"] as const) : []),
      ];

      // Each source degrades independently: a failing endpoint drops its
      // slides instead of blanking the whole carousel.
      const [resume, nextUp, latestMovies, latestTv] = await Promise.all([
        filters.showContinueWatching
          ? getItemsApi(api)
              .getResumeItems({
                userId: user.Id,
                limit: overFetch(filters.continueWatchingQuota),
                includeItemTypes: resumeTypes,
                fields: ["Overview"],
                enableImageTypes: [...IMAGE_TYPES],
                imageTypeLimit: 1,
              })
              .catch(() => null)
          : null,
        filters.showNextUp
          ? getTvShowsApi(api)
              .getNextUp({
                userId: user.Id,
                limit: overFetch(filters.nextUpQuota),
                fields: ["Overview"],
                enableImageTypes: [...IMAGE_TYPES],
                imageTypeLimit: 1,
                enableResumable: false,
              })
              .catch(() => null)
          : null,
        filters.showRecentlyAddedMovies
          ? getUserLibraryApi(api)
              .getLatestMedia({
                userId: user.Id,
                includeItemTypes: ["Movie"],
                limit: overFetch(filters.recentlyAddedMovieQuota),
                fields: ["Overview"],
                enableImageTypes: [...IMAGE_TYPES],
                imageTypeLimit: 1,
                groupItems: false,
              })
              .catch(() => null)
          : null,
        filters.showRecentlyAddedTv
          ? getUserLibraryApi(api)
              .getLatestMedia({
                userId: user.Id,
                includeItemTypes: ["Series", "Season", "Episode"],
                limit: overFetch(filters.recentlyAddedTvQuota),
                fields: ["Overview"],
                enableImageTypes: [...IMAGE_TYPES],
                imageTypeLimit: 1,
                groupItems: true,
              })
              .catch(() => null)
          : null,
      ]);

      const result: HeroEntry[] = [];
      const seenIds = new Set<string>();
      const seenSeries = new Set<string>();
      const seriesKey = (item: BaseItemDto) =>
        item.SeriesId || (item.Type === "Series" ? item.Id : undefined);

      const push = (
        item: BaseItemDto | null | undefined,
        section: HeroSection,
      ): boolean => {
        if (!item?.Id || seenIds.has(item.Id)) return false;
        // Endpoints can return a mixed bag (resume covers both kinds), so the
        // media-type filter is enforced on results, not just on the request.
        const mediaType = mediaTypeOf(item);
        if (mediaType === "movie" && !filters.showMovies) return false;
        if (mediaType === "tv" && !filters.showTv) return false;
        // One card per show across the whole carousel: with ten slides the
        // same series could otherwise turn up as continue-watching, next-up
        // and recently-added all at once.
        const key = seriesKey(item);
        if (key && seenSeries.has(key)) return false;
        seenIds.add(item.Id);
        if (key) seenSeries.add(key);
        result.push({ item, section });
        return true;
      };

      const buckets = [
        {
          section: "continueWatching" as const,
          candidates: resume?.data.Items ?? [],
          quota: filters.continueWatchingQuota,
        },
        {
          section: "nextUp" as const,
          candidates: nextUp?.data.Items ?? [],
          quota: filters.nextUpQuota,
        },
        {
          section: "recentlyAdded" as const,
          candidates: latestMovies?.data ?? [],
          quota: filters.recentlyAddedMovieQuota,
        },
        {
          section: "recentlyAdded" as const,
          candidates: latestTv?.data ?? [],
          quota: filters.recentlyAddedTvQuota,
        },
      ];

      // Each bucket keeps its own cursor, so the backfill pass resumes where
      // the quota pass stopped instead of re-testing rejected candidates.
      const cursors = buckets.map(() => 0);
      const takeFrom = (index: number): boolean => {
        const { candidates, section } = buckets[index];
        while (cursors[index] < candidates.length) {
          const item = candidates[cursors[index]];
          cursors[index] += 1;
          if (push(item, section)) return true;
        }
        return false;
      };

      buckets.forEach((bucket, index) => {
        for (let taken = 0; taken < bucket.quota; taken++) {
          if (result.length >= HERO_TARGET_COUNT) return;
          if (!takeFrom(index)) break;
        }
      });

      // Backfill: whatever a bucket couldn't fill (dedup, a thin library)
      // goes to the buckets that still have candidates, round-robin so no
      // single group runs away with the remainder.
      let progressed = true;
      while (result.length < HERO_TARGET_COUNT && progressed) {
        progressed = false;
        for (let index = 0; index < buckets.length; index++) {
          if (result.length >= HERO_TARGET_COUNT) break;
          if (takeFrom(index)) progressed = true;
        }
      }

      // Backfilled slides are appended wherever they were found, which can
      // strand e.g. a continue-watching card after the recently-added run.
      // Sorting is stable, so this regroups them without disturbing the
      // order within a group.
      result.sort(
        (a, b) =>
          ALL_SECTIONS.indexOf(a.section) - ALL_SECTIONS.indexOf(b.section),
      );

      return result;
    },
    enabled:
      isHeroCarouselAvailable() && showHeroCarousel && !!api && !!user?.Id,
    staleTime: 60 * 1000,
  });

  const items = useMemo<HeroCarouselItem[]>(() => {
    if (!api || !entries) return [];
    return entries.map(({ item, section }) => ({
      id: item.Id!,
      title: (isTvChild(item) ? item.SeriesName : item.Name) || item.Name || "",
      subtitle: buildSubtitle(item),
      overview: item.Overview || "",
      label: t(SECTION_LABEL_KEYS[section]),
      labelIcon: SECTION_ICONS[section],
      backdropUrl: buildBackdropUrl(api, item, metrics.backdropWidth),
      logoUrl: buildLogoUrl(api, item),
      posterUrl: buildPosterUrl(api, item),
      badges: buildBadges(item),
      communityRating: item.CommunityRating ?? null,
      progress: item.UserData?.PlayedPercentage
        ? item.UserData.PlayedPercentage / 100
        : null,
    }));
  }, [api, entries, t, metrics.backdropWidth]);

  // An admin-locked setting is dropped by updateSettings, so offering its row
  // would just be a dead tap. Omit those rows the way the settings screen
  // disables their switches; with all three locked the button disappears.
  const filterSections = useMemo<HeroCarouselFilterSection[]>(() => {
    const sections: HeroCarouselFilterSection[] = [];
    if (pluginSettings?.hiddenHomeHeroSections?.locked !== true) {
      sections.push({
        key: "groups",
        title: t("home.hero.groups"),
        options: ALL_SECTIONS.map((section) => ({
          key: `${SECTION_KEY_PREFIX}${section}`,
          label: t(SECTION_LABEL_KEYS[section]),
          enabled: !(hiddenSections ?? []).includes(section),
        })),
      });
    }
    if (pluginSettings?.hiddenHomeHeroMediaTypes?.locked !== true) {
      sections.push({
        key: "media",
        title: t("home.hero.media"),
        options: ALL_MEDIA_TYPES.map((mediaType) => ({
          key: `${MEDIA_KEY_PREFIX}${mediaType}`,
          label: t(MEDIA_LABEL_KEYS[mediaType]),
          enabled: !(hiddenMediaTypes ?? []).includes(mediaType),
        })),
      });
    }
    if (pluginSettings?.showHeroCarousel?.locked !== true) {
      sections.push({
        // Untitled trailing group: this switches the hero off entirely
        // rather than filtering it, so it reads as its own thing.
        key: "visibility",
        options: [
          {
            key: VISIBILITY_KEY,
            label: t("home.hero.disable"),
            // Only reachable while the hero is on, so it is a one-way
            // action rather than something that can show a checkmark.
            enabled: true,
            destructive: true,
          },
        ],
      });
    }
    return sections;
  }, [t, hiddenSections, hiddenMediaTypes, pluginSettings]);

  const handleFilterToggle = useCallback(
    (event: { nativeEvent: HeroCarouselFilterToggleEvent }) => {
      const { key } = event.nativeEvent;
      lightHapticFeedback();
      if (key === VISIBILITY_KEY) {
        // The row only ever shows checked — the hero is gone once it is off,
        // so the way back is the appearance settings screen.
        updateSettings({ showHeroCarousel: false });
        return;
      }
      if (key.startsWith(SECTION_KEY_PREFIX)) {
        const section = key.slice(SECTION_KEY_PREFIX.length) as HomeHeroSection;
        const next = toggleHidden(hiddenSections ?? [], section);
        if (!hasAnySource(next, hiddenMediaTypes ?? [])) return;
        updateSettings({ hiddenHomeHeroSections: next });
        return;
      }
      if (key.startsWith(MEDIA_KEY_PREFIX)) {
        const mediaType = key.slice(
          MEDIA_KEY_PREFIX.length,
        ) as HomeHeroMediaType;
        const next = toggleHidden(hiddenMediaTypes ?? [], mediaType);
        if (!hasAnySource(hiddenSections ?? [], next)) return;
        updateSettings({ hiddenHomeHeroMediaTypes: next });
      }
    },
    [hiddenSections, hiddenMediaTypes, updateSettings, lightHapticFeedback],
  );

  const handleItemPress = useCallback(
    (event: { nativeEvent: HeroCarouselItemPressEvent }) => {
      const entry = entries?.find(
        ({ item }) => item.Id === event.nativeEvent.id,
      );
      if (!entry) return;
      lightHapticFeedback();
      router.push(getItemNavigation(entry.item, from) as any);
    },
    [entries, from, router, lightHapticFeedback],
  );

  // Keep the view mounted when filters emptied it, so the filter button (and
  // the way back) stays reachable over the empty-state skeleton.
  const hasActiveFilters =
    (hiddenSections?.length ?? 0) > 0 || (hiddenMediaTypes?.length ?? 0) > 0;
  if (!isHeroCarouselAvailable() || !showHeroCarousel) return null;
  if (items.length === 0 && !hasActiveFilters) return null;

  return (
    <HeroCarouselView
      items={items}
      imageHeaders={imageHeaders}
      filterSections={filterSections}
      filterLabel={t("home.hero.filter")}
      onItemPress={handleItemPress}
      onFilterToggle={handleFilterToggle}
      style={{
        width: "100%",
        height: metrics.cardHeight + DOTS_AREA,
        marginTop: 8,
      }}
    />
  );
};
