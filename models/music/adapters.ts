import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { AudioTrack } from "@/providers/AudioPlayer/types";
import {
  detectMediaSource,
  getArtworkUrl as getCommonArtworkUrl,
  getStreamUrl as getCommonStreamUrl,
  toBaseMediaEntity,
} from "../common/adapters";
import type {
  Album,
  AlbumDownloadInfo,
  Artist,
  ArtistDownloadInfo,
  Playlist,
  PlaylistDownloadInfo,
  Song,
  SongDownloadInfo,
} from "./types";
import { MediaSource as MediaSourceEnum } from "./types";

/**
 * Get artwork URL for a music item
 * Wraps common adapter for backward compatibility
 */
export function getArtworkUrl(
  item: BaseItemDto,
  api?: Api,
): string | undefined {
  return getCommonArtworkUrl(item, api, 300);
}

/**
 * Get stream URL for an audio item
 * Wraps common adapter for backward compatibility
 */
export function getStreamUrl(
  item: BaseItemDto,
  api?: Api,
  userId?: string,
): string | undefined {
  return getCommonStreamUrl(item, api, userId);
}

/**
 * Convert Jellyfin BaseItemDto to Song domain model
 * Automatically detects if song is downloaded and sets appropriate source
 */
export function toSong(
  item: BaseItemDto,
  downloadInfo?: SongDownloadInfo | any,
  api?: Api,
  userId?: string,
): Song {
  const source = detectMediaSource(item, downloadInfo);
  const baseEntity = toBaseMediaEntity(item, downloadInfo, api);

  return {
    ...baseEntity,
    source,
    serverId: item.ServerId || api?.basePath || "unknown",

    title: item.Name!,
    artistName: item.Artists?.[0] ?? undefined,
    artistId: item.ArtistItems?.[0]?.Id ?? undefined,
    albumName: item.Album ?? undefined,
    albumId: item.AlbumId ?? undefined,
    albumArtist: item.AlbumArtist ?? undefined,
    duration: item.RunTimeTicks ? item.RunTimeTicks / 10000000 : undefined,
    trackNumber: item.IndexNumber ?? undefined,
    discNumber: item.ParentIndexNumber ?? undefined,

    streamUrl:
      source === MediaSourceEnum.Online
        ? getStreamUrl(item, api, userId)
        : undefined,
    localPath: downloadInfo?.filePath,
    mediaSources: item.MediaSources ?? undefined,
    downloadInfo,
  };
}

/**
 * Convert to Album domain model
 */
export function toAlbum(
  item: BaseItemDto,
  downloadInfo?: AlbumDownloadInfo | any,
  api?: Api,
): Album {
  const source = detectMediaSource(item, downloadInfo);
  const baseEntity = toBaseMediaEntity(item, downloadInfo, api);

  return {
    ...baseEntity,
    source,
    serverId: item.ServerId || api?.basePath || "unknown",

    artistName: item.AlbumArtist ?? item.Artists?.[0] ?? undefined,
    artistId: item.ArtistItems?.[0]?.Id ?? undefined,
    trackCount: item.ChildCount ?? undefined,
    runTimeTicks: item.RunTimeTicks ?? undefined,
    childCount: item.ChildCount ?? undefined,
    downloadInfo,
  };
}

/**
 * Convert to Artist domain model
 */
export function toArtist(
  item: BaseItemDto,
  downloadInfo?: ArtistDownloadInfo | any,
  api?: Api,
): Artist {
  const source = detectMediaSource(item, downloadInfo);
  const baseEntity = toBaseMediaEntity(item, downloadInfo, api);

  return {
    ...baseEntity,
    source,
    serverId: item.ServerId || api?.basePath || "unknown",

    albumCount: item.ChildCount ?? undefined,
    songCount: item.RecursiveItemCount ?? undefined,
    childCount: item.ChildCount ?? undefined,
    downloadInfo,
  };
}

/**
 * Convert to Playlist domain model
 */
export function toPlaylist(
  item: BaseItemDto,
  downloadInfo?: PlaylistDownloadInfo | any,
  api?: Api,
): Playlist {
  const source = detectMediaSource(item, downloadInfo);
  const baseEntity = toBaseMediaEntity(item, downloadInfo, api);

  return {
    ...baseEntity,
    source,
    serverId: item.ServerId || api?.basePath || "unknown",

    description: item.Overview ?? undefined,
    owner: undefined, // Owner field doesn't exist on BaseItemDto
    trackCount: item.ChildCount ?? undefined,
    childCount: item.ChildCount ?? undefined,
    downloadInfo,
  };
}

/**
 * Convert Song to AudioTrack for player
 */
export function songToAudioTrack(song: Song): AudioTrack {
  return {
    id: song.id,
    jellyfinItem: song.jellyfinItem,
    title: song.title,
    artist: song.artistName,
    album: song.albumName,
    albumArtist: song.albumArtist,
    artwork: song.artwork,
    duration: song.duration,
    isOffline: song.source === MediaSourceEnum.Offline,
    localPath: song.localPath,
    trackNumber: song.trackNumber,
    discNumber: song.discNumber,
    year: song.year,
    genre: song.genres?.[0],
    url:
      song.source === MediaSourceEnum.Offline && song.localPath
        ? `file://${song.localPath}`
        : song.streamUrl || "",
  };
}

/**
 * Convert BaseItemDto to Song, checking if it's downloaded
 * This is a convenience function that checks download status
 */
export function baseItemDtoToSong(
  item: BaseItemDto,
  getDownloadInfo: (itemId: string) => SongDownloadInfo | undefined,
  api?: Api,
  userId?: string,
): Song {
  const downloadInfo = item.Id ? getDownloadInfo(item.Id) : undefined;
  return toSong(item, downloadInfo, api, userId);
}
