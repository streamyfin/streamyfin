import type {
  BaseItemDto,
  BaseItemKind,
} from "@jellyfin/sdk/lib/generated-client/models";

/**
 * Kinds that stand for other items: folders of every sort (a season, a box
 * set, a plugin channel) and the by-name kinds (a genre, a person, a year).
 * They have no stream of their own, but the server can name the playable
 * items inside or behind them.
 */
const CONTAINER_KINDS: readonly BaseItemKind[] = [
  "AggregateFolder",
  "BasePluginFolder",
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
  "PhotoAlbum",
  "Playlist",
  "PlaylistsFolder",
  "Season",
  "Series",
  "Studio",
  "UserRootFolder",
  "UserView",
  "Year",
];

/** Single items the player has no renderer for. */
const UNPLAYABLE_LEAF_KINDS: readonly BaseItemKind[] = ["Book", "Photo"];

/**
 * Item kinds the server holds no stream for. Asking PlaybackInfo for one of
 * them is answered with a 400 or a 500, never with a media source.
 *
 * A deny list rather than an allow list on purpose: a kind this app has never
 * heard of stays playable and the server gets to decide, so a new Jellyfin
 * item kind cannot silently lose its Play button.
 */
const UNPLAYABLE_KINDS: ReadonlySet<BaseItemKind> = new Set<BaseItemKind>([
  ...CONTAINER_KINDS,
  ...UNPLAYABLE_LEAF_KINDS,
]);

const SERVER_EXPANDED_KINDS: ReadonlySet<BaseItemKind> = new Set(
  CONTAINER_KINDS,
);

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

/**
 * Whether a Play command for this item is worth sending to another session.
 * Not the same question as `isPlayableItem`: the command goes through the
 * server, which replaces a container with the playable items it holds before
 * the target session receives anything, so a Series or a Playlist is a valid
 * thing to send although no player can open it directly. Only an unplayable
 * leaf, a Book or a Photo, goes out as it is and fails at the other end.
 *
 * Keyed on the kind rather than on `IsFolder`: that flag is optional in the
 * DTO, and it is false for the by-name kinds the server expands just the same.
 */
export const canPlayInRemoteSession = (
  item: Pick<BaseItemDto, "Type" | "MediaType">,
): boolean =>
  isPlayableItem(item) || (!!item.Type && SERVER_EXPANDED_KINDS.has(item.Type));
