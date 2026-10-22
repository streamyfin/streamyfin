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
import type {
  HomeSection,
  HomeSectionCustomEndpointResolver,
} from "@/utils/atoms/settings";
import { describeValueShape, isJellyfinId } from "@/utils/jellyfin/itemId";
import { writeToLog } from "@/utils/log";

// The sections already logged as left empty, by server, account and place on
// the home, so a home that refreshes on every visit does not write the same
// line each time, and another server or account still gets its own.
const loggedSections = new Set<string>();

/** Forgets the sections logged so far, for specs that each start from none. */
export const resetLoggedHomeSections = () => loggedSections.clear();

const isParentIdName = (name: string) => name.toLowerCase() === "parentid";

/**
 * The parentId Jellyfin binds from a custom endpoint's request: the first one
 * sent, whatever the case of its name. The parameters written in the
 * endpoint's own address are sent first, since axios appends the query after
 * them, and it drops whatever follows a # in the address. A null or undefined
 * value in the query is not sent at all.
 */
const firstSentParentId = ({
  endpoint,
  query,
}: HomeSectionCustomEndpointResolver): unknown => {
  const address = typeof endpoint === "string" ? endpoint.split("#")[0] : "";
  const queryStart = address.indexOf("?");
  if (queryStart !== -1) {
    const sent = new URLSearchParams(address.slice(queryStart + 1));
    for (const [name, value] of sent) {
      if (isParentIdName(name)) return value;
    }
  }
  if (query && typeof query === "object") {
    for (const [name, value] of Object.entries(query)) {
      if (isParentIdName(name) && value !== undefined && value !== null) {
        return value;
      }
    }
  }
  return undefined;
};

/**
 * Whether Jellyfin can bind a parentId: none, or a blank one, is no library
 * at all, and anything else has to read as an id.
 */
const isBindableParentId = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "") ||
  isJellyfinId(value);

/**
 * What a section shows when the parentId it would send is not an id: nothing,
 * and nothing is asked. The admin types the parentId into the plugin, which
 * passes on whatever it holds (Sentry REACT-NATIVE-1M), and Jellyfin answers
 * one it cannot read with a 400. An empty page also lets the phone home load
 * the sections it holds back until its first two have loaded. Logged once per
 * server, account and section.
 */
const leaveEmpty = (
  api: Api,
  userId: string | undefined,
  index: number,
  parentId: unknown,
): BaseItemDto[] => {
  const shape = describeValueShape(parentId);
  const logKey = JSON.stringify([api.basePath, userId ?? null, index, shape]);
  if (!loggedSections.has(logKey)) {
    loggedSections.add(logKey);
    writeToLog(
      "WARN",
      `Left home section ${index + 1} empty: its parentId (${shape}) is not a Jellyfin id`,
    );
  }
  return [];
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
  if (section.items) {
    if (!isBindableParentId(section.items.parentId)) {
      return leaveEmpty(api, userId, index, section.items.parentId);
    }
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
    const parentId = firstSentParentId(section.custom);
    if (!isBindableParentId(parentId)) {
      return leaveEmpty(api, userId, index, parentId);
    }
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
