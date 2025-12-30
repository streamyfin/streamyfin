import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { toAlbum, toArtist, toSong } from "@/models/music/adapters";
import type { Album, Artist, Song } from "@/models/music/types";
import { getDownloadedAudioById } from "@/providers/AudioPlayer/database";
import { apiAtom } from "@/providers/JellyfinProvider";

/**
 * Convert BaseItemDto array to Song array, checking for downloads
 */
export function useConvertToSongs(items: BaseItemDto[] | undefined): Song[] {
  const [api] = useAtom(apiAtom);

  return useMemo(() => {
    if (!items) return [];

    return items.map((item) => {
      const downloadInfo = item.Id
        ? getDownloadedAudioById(item.Id)
        : undefined;
      return toSong(
        item,
        downloadInfo
          ? {
              filePath: downloadInfo.audioFilePath,
              fileSize: downloadInfo.audioFileSize,
              cacheType: downloadInfo.cacheType as any,
              downloadedAt: new Date(),
              playCount: downloadInfo.playCount || 0,
              lastPlayedAt: downloadInfo.lastPlayedDate
                ? new Date(downloadInfo.lastPlayedDate)
                : undefined,
            }
          : undefined,
        api ?? undefined,
      );
    });
  }, [items, api]);
}

/**
 * Convert BaseItemDto array to Album array, checking for downloads
 */
export function useConvertToAlbums(items: BaseItemDto[] | undefined): Album[] {
  const [api] = useAtom(apiAtom);

  return useMemo(() => {
    if (!items) return [];

    return items.map((item) => {
      // TODO: Check for album download info
      return toAlbum(item, undefined, api ?? undefined);
    });
  }, [items, api]);
}

/**
 * Convert BaseItemDto array to Artist array, checking for downloads
 */
export function useConvertToArtists(
  items: BaseItemDto[] | undefined,
): Artist[] {
  const [api] = useAtom(apiAtom);

  return useMemo(() => {
    if (!items) return [];

    return items.map((item) => {
      // TODO: Check for artist download info
      return toArtist(item, undefined, api ?? undefined);
    });
  }, [items, api]);
}

/**
 * Convert a single BaseItemDto to Song, checking for download
 */
export function useConvertToSong(
  item: BaseItemDto | undefined,
): Song | undefined {
  const [api] = useAtom(apiAtom);

  return useMemo(() => {
    if (!item) return undefined;

    const downloadInfo = item.Id ? getDownloadedAudioById(item.Id) : undefined;
    return toSong(
      item,
      downloadInfo
        ? {
            filePath: downloadInfo.audioFilePath,
            fileSize: downloadInfo.audioFileSize,
            cacheType: downloadInfo.cacheType as any,
            downloadedAt: new Date(),
            playCount: downloadInfo.playCount || 0,
            lastPlayedAt: downloadInfo.lastPlayedDate
              ? new Date(downloadInfo.lastPlayedDate)
              : undefined,
          }
        : undefined,
      api ?? undefined,
    );
  }, [item, api]);
}

/**
 * Convert a single BaseItemDto to Album, checking for download
 */
export function useConvertToAlbum(
  item: BaseItemDto | undefined,
): Album | undefined {
  const [api] = useAtom(apiAtom);

  return useMemo(() => {
    if (!item) return undefined;
    // TODO: Check for album download info
    return toAlbum(item, undefined, api ?? undefined);
  }, [item, api]);
}

/**
 * Convert a single BaseItemDto to Artist, checking for download
 */
export function useConvertToArtist(
  item: BaseItemDto | undefined,
): Artist | undefined {
  const [api] = useAtom(apiAtom);

  return useMemo(() => {
    if (!item) return undefined;
    // TODO: Check for artist download info
    return toArtist(item, undefined, api ?? undefined);
  }, [item, api]);
}
