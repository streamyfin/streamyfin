import type { Api } from "@jellyfin/sdk";
import {
  type BaseItemDto,
  type BaseItemDtoQueryResult,
  type BaseItemKind,
  PersonKind,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  getItemsApi,
  getPersonsApi,
  getStudiosApi,
} from "@jellyfin/sdk/lib/utils/api";
import { sortBy } from "lodash";
import {
  SEARCH_EXCLUDED_PERSON_TYPES,
  SEARCH_PEOPLE_FETCH_LIMIT,
  SEARCH_PEOPLE_WIDE_FETCH_LIMIT,
  SEARCH_RESULT_LIMIT,
} from "@/constants/Search";
import { isAbortLikeError } from "@/utils/errors";
import { logAndCaptureError } from "@/utils/log";
import { honoursExcludedPersonTypes } from "./serverVersion";

/** What a studio's page lists, and so what a studio must have to be found. */
const STUDIO_ITEM_TYPES: BaseItemKind[] = ["Movie", "Series"];

type SearchRequest = {
  api?: Api | null;
  userId?: string;
  query: string;
  signal?: AbortSignal;
};

/**
 * A search section that fails shows as empty rather than taking the screen
 * down, so the failure is reported here. A request aborted by the next
 * keystroke is routine and stays quiet.
 */
const emptyOnFailure = async (
  message: string,
  request: () => Promise<BaseItemDto[]>,
): Promise<BaseItemDto[]> => {
  try {
    return await request();
  } catch (error) {
    if (!isAbortLikeError(error)) {
      logAndCaptureError(message, error);
    }
    return [];
  }
};

/**
 * Best matches first: the name itself, a name that starts with the search, a
 * name with a later word that does, then any other. The item search this
 * replaced was ranked by the server; the Persons API is not. The sort is
 * stable, so equal matches keep the server's order.
 */
export const rankByName = (
  items: BaseItemDto[],
  query: string,
): BaseItemDto[] => {
  const wanted = query.trim().toLowerCase();
  return sortBy(items, (item) => {
    const name = (item.Name ?? "").toLowerCase();
    if (name === wanted) return 0;
    if (name.startsWith(wanted)) return 1;
    if (name.includes(` ${wanted}`)) return 2;
    return 3;
  });
};

/**
 * Every person type but the musicians, for a server that ignores the
 * exclusion. Jellyfin 12 is asked to exclude instead: it knows types this SDK
 * does not, which an include list would drop.
 */
const NON_MUSICIAN_PERSON_TYPES = Object.values(PersonKind).filter(
  (kind) => !SEARCH_EXCLUDED_PERSON_TYPES.includes(kind),
);

/**
 * People matching a search, through the Persons API as Jellyfin Web 12 does.
 * `/Items?includeItemTypes=Person` cannot filter by person type, so it listed
 * every musician of a music library next to the actors.
 */
export const searchPeople = ({
  api,
  userId,
  query,
  serverVersion,
  signal,
}: SearchRequest & {
  serverVersion?: string | null;
}): Promise<BaseItemDto[]> => {
  if (!api || !query) return Promise.resolve([]);

  const fetchPeople = async (limit: number): Promise<BaseItemDto[]> => {
    const response = await getPersonsApi(api).getPersons(
      {
        searchTerm: query,
        limit,
        userId,
        // Never both: 10.11 would then keep no one, see serverVersion.ts.
        ...(honoursExcludedPersonTypes(serverVersion)
          ? { excludePersonTypes: SEARCH_EXCLUDED_PERSON_TYPES }
          : { personTypes: NON_MUSICIAN_PERSON_TYPES }),
      },
      { signal },
    );
    return response.data.Items ?? [];
  };

  return emptyOnFailure("People search request failed", async () => {
    let people = await fetchPeople(SEARCH_PEOPLE_FETCH_LIMIT);
    // A full answer is one the server cut off, in an order that is not
    // relevance: ranking it can only pick among the names that came early in
    // the alphabet. The wider ask is what lets the best match be in hand.
    if (people.length >= SEARCH_PEOPLE_FETCH_LIMIT) {
      people = await fetchPeople(SEARCH_PEOPLE_WIDE_FETCH_LIMIT);
    }
    return rankByName(people, query).slice(0, SEARCH_RESULT_LIMIT);
  });
};

/**
 * Studios matching a search that produced a movie or a series. A music
 * library's record labels are studios too, and their page would be empty.
 */
export const searchStudios = ({
  api,
  userId,
  query,
  signal,
}: SearchRequest): Promise<BaseItemDto[]> => {
  if (!api || !query) return Promise.resolve([]);

  return emptyOnFailure("Studio search request failed", async () => {
    const response = await getStudiosApi(api).getStudios(
      {
        searchTerm: query,
        limit: SEARCH_RESULT_LIMIT,
        userId,
        includeItemTypes: STUDIO_ITEM_TYPES,
        enableTotalRecordCount: false,
      },
      { signal },
    );
    return response.data.Items ?? [];
  });
};

/** One page of the movies and series a studio produced, by name. */
export const getStudioItems = async ({
  api,
  userId,
  studioId,
  startIndex,
  limit,
  signal,
}: {
  api: Api;
  userId?: string;
  studioId: string;
  startIndex: number;
  limit: number;
  signal?: AbortSignal;
}): Promise<BaseItemDtoQueryResult> => {
  const response = await getItemsApi(api).getItems(
    {
      userId,
      studioIds: [studioId],
      includeItemTypes: STUDIO_ITEM_TYPES,
      recursive: true,
      // Or a server that groups movies into collections lists the box sets.
      collapseBoxSetItems: false,
      sortBy: ["SortName"],
      sortOrder: ["Ascending"],
      fields: ["PrimaryImageAspectRatio"],
      startIndex,
      limit,
    },
    { signal },
  );
  return response.data;
};

/**
 * Where the next page of a paged item list starts, or undefined once every
 * item is loaded. A page that came back empty ends the list even when the
 * total says otherwise, or a count that never adds up would ask forever.
 */
export const nextStartIndex = (
  pages: (BaseItemDtoQueryResult | null | undefined)[],
): number | undefined => {
  const lastPage = pages[pages.length - 1];
  if (!lastPage?.Items?.length) return undefined;

  const loaded = pages.reduce(
    (count, page) => count + (page?.Items?.length ?? 0),
    0,
  );
  return loaded < (lastPage.TotalRecordCount ?? 0) ? loaded : undefined;
};
