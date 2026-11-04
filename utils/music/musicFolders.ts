import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * The name a folder has on disk. The server renames a folder that holds songs
 * after the album tag of its first song, so the item's name is often not the
 * folder's. Falls back to that name when the server sent no path.
 */
export const musicFolderName = (folder: BaseItemDto): string =>
  folder.Path?.split(/[\\/]/).filter(Boolean).pop() || folder.Name || "";

/** Folders by their name on disk, with numbers in order: 2 before 10. */
export const sortMusicFolders = (folders: BaseItemDto[]): BaseItemDto[] =>
  [...folders].sort((a, b) =>
    musicFolderName(a).localeCompare(musicFolderName(b), undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
