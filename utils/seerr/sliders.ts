import { isPlainObject, sortBy } from "lodash";
import type { SeerrApi } from "@/hooks/useSeerr";
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
 * The sliders in what a server answered GET /settings/discover with, none
 * when that is not a list of them.
 *
 * A 200 does not make the body Seerr's: a proxy's login page, or a server
 * URL that points at the web app rather than the API, answers 200 with HTML,
 * which axios hands over as a string, and an empty body as "". Read as
 * sliders, either crashed Discover's render. No sliders is how the other
 * Seerr reads take such a body (searchSeerr), and the next mount asks again.
 */
export const slidersOf = (body: unknown): DiscoverSlider[] =>
  Array.isArray(body) ? body.filter(isPlainObject) : [];

/**
 * The server's sliders, for a query to resolve to: none without a client,
 * which a query outlives when the user signs out of Seerr while it retries.
 * Undefined is the one value React Query does not take, and fails the query
 * over ("data is undefined").
 */
export const loadDiscoverSliders = async (
  api: Pick<SeerrApi, "discoverSettings"> | undefined,
): Promise<DiscoverSlider[]> => (api ? api.discoverSettings() : []);

/**
 * The rows Discover shows, on the phone and the TV alike: those the server
 * enables, in its order, that the app draws, the recently added only to
 * those Seerr shows it to. The first one is where the TV puts the focus.
 *
 * Read through slidersOf once more: the query's answer is kept on the device
 * for a day, so one stored before the response was checked still gets here.
 */
export const discoverRows = (
  sliders: unknown,
  permissions: number,
): DiscoverSlider[] =>
  sortBy(
    slidersOf(sliders).filter(
      (slider) =>
        slider.enabled &&
        DRAWN.has(slider.type) &&
        (slider.type !== DiscoverSliderType.RECENTLY_ADDED ||
          canSeeRecentlyAdded(permissions)),
    ),
    "order",
  );
