import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { Album, Artist, Playlist, Song } from "./types";
import { MediaSource } from "./types";

/**
 * Type guard to check if an item is a Song domain model
 */
export function isSong(item: BaseItemDto | Song | unknown): item is Song {
  return (
    typeof item === "object" &&
    item !== null &&
    "source" in item &&
    "title" in item &&
    "jellyfinItem" in item
  );
}

/**
 * Type guard to check if an item is an Album domain model
 */
export function isAlbum(item: BaseItemDto | Album | unknown): item is Album {
  return (
    typeof item === "object" &&
    item !== null &&
    "source" in item &&
    "jellyfinItem" in item &&
    !("title" in item) && // Songs have title, albums don't
    "trackCount" in item
  );
}

/**
 * Type guard to check if an item is an Artist domain model
 */
export function isArtist(item: BaseItemDto | Artist | unknown): item is Artist {
  return (
    typeof item === "object" &&
    item !== null &&
    "source" in item &&
    "jellyfinItem" in item &&
    "albumCount" in item
  );
}

/**
 * Type guard to check if an item is a Playlist domain model
 */
export function isPlaylist(
  item: BaseItemDto | Playlist | unknown,
): item is Playlist {
  return (
    typeof item === "object" &&
    item !== null &&
    "source" in item &&
    "jellyfinItem" in item &&
    "owner" in item
  );
}

/**
 * Check if a music entity is available offline
 */
export function isOffline(item: Song | Album | Artist | Playlist): boolean {
  return item.source === MediaSource.Offline;
}

/**
 * Check if a music entity is online (streaming)
 */
export function isOnline(item: Song | Album | Artist | Playlist): boolean {
  return item.source === MediaSource.Online;
}

/**
 * Check if a music entity is being cast to a remote device
 */
export function isCast(item: Song | Album | Artist | Playlist): boolean {
  return item.source === MediaSource.Cast;
}

/**
 * Type guard to check if an item is a music domain model (any type)
 */
export function isMusicDomainModel(
  item: unknown,
): item is Song | Album | Artist | Playlist {
  return isSong(item) || isAlbum(item) || isArtist(item) || isPlaylist(item);
}
