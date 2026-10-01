import { sortBy } from "lodash";
import { canSeeRecentlyAdded } from "./permissions";
import { type DiscoverSlider, DiscoverSliderType } from "./types";

/** The rows of Seerr's Discover the app draws, the others being left out. */
const DRAWN = new Set([
  DiscoverSliderType.RECENTLY_ADDED,
  DiscoverSliderType.RECENT_REQUESTS,
  DiscoverSliderType.TRENDING,
  DiscoverSliderType.POPULAR_MOVIES,
  DiscoverSliderType.MOVIE_GENRES,
  DiscoverSliderType.UPCOMING_MOVIES,
  DiscoverSliderType.STUDIOS,
  DiscoverSliderType.POPULAR_TV,
  DiscoverSliderType.TV_GENRES,
  DiscoverSliderType.UPCOMING_TV,
  DiscoverSliderType.NETWORKS,
]);

/**
 * The rows Discover shows, on the phone and the TV alike: those the server
 * enables, in its order, that the app draws, the recently added only to
 * those Seerr shows it to. The first one is where the TV puts the focus.
 */
export const discoverRows = (
  sliders: DiscoverSlider[] | undefined,
  permissions: number,
): DiscoverSlider[] =>
  sortBy(
    (sliders ?? []).filter(
      (slider) =>
        slider.enabled &&
        DRAWN.has(slider.type) &&
        (slider.type !== DiscoverSliderType.RECENTLY_ADDED ||
          canSeeRecentlyAdded(permissions)),
    ),
    "order",
  );
