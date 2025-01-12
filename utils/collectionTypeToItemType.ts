import {
  BaseItemKind,
  CollectionType,
} from "@jellyfin/sdk/lib/generated-client";

/**
 * Converts a ColletionType to a BaseItemKind (also called ItemType)
 * 
 * CollectionTypes
 *  readonly Unknown: "unknown";
    readonly Movies: "movies";
    readonly Tvshows: "tvshows";
    readonly Trailers: "trailers";
    readonly Homevideos: "homevideos";
    readonly Boxsets: "boxsets";
    readonly Books: "books";
    readonly Photos: "photos";
    readonly Livetv: "livetv";
    readonly Playlists: "playlists";
    readonly Folders: "folders";
 */
export const colletionTypeToItemType = (
  collectionType?: CollectionType | null
): BaseItemKind | undefined => {
  if (!collectionType) return undefined;

  switch (collectionType) {
    case CollectionType.Movies:
      return BaseItemKind.Movie;
    case CollectionType.Tvshows:
      return BaseItemKind.Series;
    case CollectionType.Homevideos:
      return BaseItemKind.Video;
    case CollectionType.Books:
      return BaseItemKind.Book;
    case CollectionType.Playlists:
      return BaseItemKind.Playlist;
    case CollectionType.Folders:
      return BaseItemKind.Folder;
    case CollectionType.Photos:
      return BaseItemKind.Photo;
    case CollectionType.Trailers:
      return BaseItemKind.Trailer;
    case CollectionType.Playlists:
      return BaseItemKind.Playlist;
  }

  return undefined;
};
