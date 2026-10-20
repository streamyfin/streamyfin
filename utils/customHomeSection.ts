import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  getItemsApi,
  getTvShowsApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import type { HomeSection } from "@/utils/atoms/settings";
import { describeValueShape, isJellyfinId } from "@/utils/jellyfin/itemId";
import { writeToLog } from "@/utils/log";

// The sections already logged as left empty, so a home that refreshes on every
// visit does not write the same line each time.
const loggedSections = new Set<string>();

/**
 * The parentIds a section sends, read in the order the request below picks its
 * payload: the items payload's, or every one among a custom endpoint's
 * parameters under any case, the way Jellyfin binds it (the request passes
 * them all on). A next up or latest section's is never sent. A blank one is
 * left out, as the request leaves it: the SDK and axios drop a null, and
 * Jellyfin binds an empty value as no library at all.
 */
const sentParentIds = (section: HomeSection): unknown[] => {
  let values: unknown[] = [];
  if (section.items) {
    values = [section.items.parentId];
  } else if (!section.nextUp && !section.latest) {
    const query: unknown = section.custom?.query;
    if (query && typeof query === "object") {
      values = Object.entries(query)
        .filter(([name]) => name.toLowerCase() === "parentid")
        .map(([, value]) => value);
    }
  }
  return values.filter(
    (value) =>
      value !== undefined &&
      value !== null &&
      !(typeof value === "string" && value.trim() === ""),
  );
};

/**
 * One page of a home section the server's plugin describes, for the phone and
 * the TV home alike. Covered by utils/customHomeSection.test.ts.
 */
export const fetchCustomHomeSection = async (
  api: Api,
  {
    section,
    index,
    userId,
    pageParam,
    pageSize,
  }: {
    section: HomeSection;
    /** Where the section sits on the home, for the log. */
    index: number;
    userId?: string;
    pageParam: number;
    pageSize: number;
  },
): Promise<BaseItemDto[]> => {
  // The admin types the parentId into the plugin, which passes on a value that
  // is not an id for the request to deal with (Sentry REACT-NATIVE-1M). Jellyfin
  // answers it with a 400, so the section has nothing to show and nothing is
  // asked. An empty page also lets the phone home load the sections it holds
  // back until its first two have loaded.
  const parentId = sentParentIds(section).find((id) => !isJellyfinId(id));
  if (parentId !== undefined) {
    const shape = describeValueShape(parentId);
    const logKey = `${index}|${shape}`;
    if (!loggedSections.has(logKey)) {
      loggedSections.add(logKey);
      writeToLog(
        "WARN",
        `Left home section ${index + 1} empty: its parentId (${shape}) is not a Jellyfin id`,
      );
    }
    return [];
  }

  if (section.items) {
    const response = await getItemsApi(api).getItems({
      userId,
      startIndex: pageParam,
      limit: section.items?.limit || pageSize,
      recursive: true,
      includeItemTypes: section.items?.includeItemTypes,
      sortBy: section.items?.sortBy,
      sortOrder: section.items?.sortOrder,
      filters: section.items?.filters,
      parentId: section.items?.parentId,
    });
    return response.data.Items || [];
  }
  if (section.nextUp) {
    const response = await getTvShowsApi(api).getNextUp({
      userId,
      startIndex: pageParam,
      limit: section.nextUp?.limit || pageSize,
      enableImageTypes: ["Primary", "Backdrop", "Thumb"],
      enableResumable: section.nextUp?.enableResumable,
      enableRewatching: section.nextUp?.enableRewatching,
    });
    return response.data.Items || [];
  }
  if (section.latest) {
    // getLatestMedia doesn't support startIndex, so we fetch all and slice client-side
    const allData =
      (
        await getUserLibraryApi(api).getLatestMedia({
          userId,
          includeItemTypes: section.latest?.includeItemTypes,
          limit: section.latest?.limit || 10,
          isPlayed: section.latest?.isPlayed,
          groupItems: section.latest?.groupItems,
        })
      ).data || [];

    // Simulate pagination by slicing
    return allData.slice(pageParam, pageParam + pageSize);
  }
  if (section.custom) {
    const response = await api.get<BaseItemDtoQueryResult>(
      section.custom.endpoint,
      {
        params: {
          ...(section.custom.query || {}),
          userId,
          startIndex: pageParam,
          limit: pageSize,
        },
        headers: section.custom.headers || {},
      },
    );
    return response.data.Items || [];
  }
  return [];
};
