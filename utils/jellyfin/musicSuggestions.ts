import type { Api } from "@jellyfin/sdk";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";

/** Fetches grouped latest audio, falling back to date-sorted albums only for empty results. */
export const getLatestMusicAlbums = async (
  api: Api,
  userId: string,
  libraryId: string,
) => {
  const libraryApi = getLibraryApi(api);
  const response = await libraryApi.getLatestMedia({
    userId,
    parentId: libraryId,
    includeItemTypes: ["Audio"],
    limit: 20,
    fields: ["PrimaryImageAspectRatio"],
    imageTypeLimit: 1,
    enableImageTypes: ["Primary", "Backdrop", "Banner", "Thumb"],
  });

  if (Array.isArray(response.data) && response.data.length > 0) {
    return response.data;
  }

  // Some servers do not group latest audio into albums.
  const fallback = await libraryApi.getItems({
    userId,
    parentId: libraryId,
    includeItemTypes: ["MusicAlbum"],
    sortBy: ["DateCreated"],
    sortOrder: ["Descending"],
    limit: 20,
    recursive: true,
    fields: ["PrimaryImageAspectRatio", "SortName"],
    imageTypeLimit: 1,
    enableImageTypes: ["Primary", "Backdrop", "Banner", "Thumb"],
    enableTotalRecordCount: false,
  });
  return fallback.data.Items || [];
};
