import type { Api } from "@jellyfin/sdk";
import type { BaseItemKind } from "@jellyfin/sdk/lib/generated-client/models";
import { getFilterApi } from "@jellyfin/sdk/lib/utils/api";

/**
 * The official ratings a library's items carry, as the server spells them.
 *
 * `includeItemTypes` is the kind of item the grid lists (getLibraryItemTypes).
 * Without it the server also reports the ratings only seasons or episodes
 * carry, and on Jellyfin 10.11, where the items filter reads each item's own
 * rating, picking one of those empties a Shows library.
 */
export const fetchOfficialRatings = async (
  api: Api,
  request: {
    userId?: string;
    parentId: string;
    includeItemTypes: BaseItemKind[] | undefined;
  },
): Promise<string[]> => {
  const response = await getFilterApi(api).getQueryFiltersLegacy(request);
  return response.data?.OfficialRatings ?? [];
};

/**
 * The library's ratings plus any selected one it no longer reports, so a saved
 * selection can always be seen and taken back, as the language filters do
 * with withSelectedLanguages.
 */
export const withSelectedRatings = (
  options: string[],
  selected: string[],
): string[] => {
  const missing = selected.filter((rating) => !options.includes(rating));
  return missing.length === 0 ? options : [...options, ...missing];
};
