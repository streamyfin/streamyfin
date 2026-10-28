import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getLibraryItemTypes } from "@/utils/library/libraryItemsQuery";
import { fetchOfficialRatings } from "@/utils/library/officialRatings";

/**
 * The official ratings a library's items carry, asked for the kind of item its
 * grid lists (see fetchOfficialRatings). The phone chip and the TV sheet read
 * it with the same key, so they share one request. `enabled` is false until
 * the library has loaded: the item type comes from it.
 */
export const useOfficialRatingOptions = (
  libraryId: string,
  collectionType: BaseItemDto["CollectionType"],
  enabled: boolean,
) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const itemTypes = getLibraryItemTypes(collectionType);

  const { data } = useQuery({
    // The user is part of it: the server only lists what that user may see.
    queryKey: ["filters", "OfficialRatings", libraryId, itemTypes, user?.Id],
    queryFn: async () => {
      if (!api) return [];
      return fetchOfficialRatings(api, {
        userId: user?.Id,
        parentId: libraryId,
        includeItemTypes: itemTypes,
      });
    },
    enabled: enabled && !!api && !!user?.Id && !!libraryId,
    // A reader that is off (the page on a phone, where the chip reads it) is
    // not re-rendered when the other one's answer lands.
    subscribed: enabled,
  });

  return data;
};
