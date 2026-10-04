import type {
  BaseItemDto,
  BaseItemKind,
} from "@jellyfin/sdk/lib/generated-client/models";

/**
 * Item kinds the server holds no stream for: containers (a season, a folder,
 * a plugin channel) and media the player has no renderer for (books, photos).
 * Asking PlaybackInfo for one of them is answered with a 400 or a 500, never
 * with a media source.
 *
 * A deny list rather than an allow list on purpose: a kind this app has never
 * heard of stays playable and the server gets to decide, so a new Jellyfin
 * item kind cannot silently lose its Play button.
 */
const UNPLAYABLE_KINDS: ReadonlySet<BaseItemKind> = new Set<BaseItemKind>([
  "AggregateFolder",
  "BasePluginFolder",
  "Book",
  "BoxSet",
  "Channel",
  "ChannelFolderItem",
  "CollectionFolder",
  "Folder",
  "Genre",
  "ManualPlaylistsFolder",
  "MusicAlbum",
  "MusicArtist",
  "MusicGenre",
  "Person",
  "Photo",
  "PhotoAlbum",
  "Playlist",
  "PlaylistsFolder",
  "Season",
  "Series",
  "Studio",
  "UserRootFolder",
  "UserView",
  "Year",
]);

/**
 * Whether the video player can be asked to play this item. The one predicate
 * behind every Play affordance and behind the stream negotiation itself, so a
 * screen that forgets to hide its button still cannot reach the server.
 *
 * `MediaType` is checked next to `Type` because the server reports a book or
 * a photo that way whatever the item kind is called.
 */
export const isPlayableItem = (
  item: Pick<BaseItemDto, "Type" | "MediaType">,
): boolean => {
  if (item.MediaType === "Book" || item.MediaType === "Photo") return false;
  return !item.Type || !UNPLAYABLE_KINDS.has(item.Type);
};
