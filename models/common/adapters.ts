import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  UserItemDataDto,
} from "@jellyfin/sdk/lib/generated-client";
import { getStoredImage } from "@/utils/storedImages";
import type {
  BaseDownloadInfo,
  BaseMediaEntity,
  MediaProvider,
  MediaSource,
  UserMediaData,
} from "./types";
import { MediaSource as MediaSourceEnum } from "./types";

/**
 * Detect media source from item and download info
 * Checks multiple possible file path properties for compatibility
 */
export function detectMediaSource(
  _item: BaseItemDto,
  downloadInfo?: BaseDownloadInfo | any,
): MediaSource {
  // Check various download info formats:
  // - filePath: Used by VideoDownloadInfo
  // - videoFilePath: Used by DownloadedItem (video downloads)
  // - audioFilePath: Used by DownloadedAudio (music downloads)
  if (
    downloadInfo?.filePath ||
    downloadInfo?.videoFilePath ||
    downloadInfo?.audioFilePath
  ) {
    return MediaSourceEnum.Offline;
  }
  // Could add cast detection here in the future
  return MediaSourceEnum.Online;
}

/**
 * Detect media provider from Jellyfin ProviderIds
 * This allows handling content from Jellyfin plugins (YouTube, Twitch, etc.)
 */
export function detectMediaProvider(item: BaseItemDto): MediaProvider {
  if (item.ProviderIds?.youtube) {
    return { type: "youtube", id: item.ProviderIds.youtube };
  }
  if (item.ProviderIds?.twitch) {
    return { type: "twitch", id: item.ProviderIds.twitch };
  }
  // Add more providers as needed
  return { type: "jellyfin" };
}

/**
 * Convert Jellyfin UserData to our domain UserMediaData
 */
export function mapUserData(userData?: UserItemDataDto): UserMediaData {
  if (!userData) {
    return {
      isFavorite: false,
      playCount: 0,
      isPlayed: false,
    };
  }

  return {
    isFavorite: userData.IsFavorite ?? false,
    playCount: userData.PlayCount ?? 0,
    lastPlayedDate: userData.LastPlayedDate
      ? new Date(userData.LastPlayedDate)
      : undefined,
    playbackPositionTicks: userData.PlaybackPositionTicks ?? undefined,
    playedPercentage: userData.PlayedPercentage ?? undefined,
    isPlayed: userData.Played ?? false,
  };
}

/**
 * Get image URL for an item
 */
export function getImageUrl(
  item: BaseItemDto,
  imageType: "Primary" | "Backdrop" | "Logo" | "Thumb",
  api?: Api,
  width?: number,
  height?: number,
): string | undefined {
  if (!api?.basePath || !item.Id) return undefined;

  const hasImage =
    imageType === "Primary"
      ? item.ImageTags?.Primary
      : imageType === "Backdrop"
        ? item.BackdropImageTags?.length
        : imageType === "Logo"
          ? item.ImageTags?.Logo
          : item.ImageTags?.Thumb;

  if (!hasImage) return undefined;

  const sizeParams =
    width && height
      ? `fillWidth=${width}&fillHeight=${height}`
      : width
        ? `maxWidth=${width}`
        : height
          ? `maxHeight=${height}`
          : "";

  return `${api.basePath}/Items/${item.Id}/Images/${imageType}${sizeParams ? `?${sizeParams}` : ""}`;
}

/**
 * Get artwork URL for an item
 * For tracks and podcast episodes, prefer album/series artwork
 */
export function getArtworkUrl(
  item: BaseItemDto,
  api?: Api,
  size: number = 300,
): string | undefined {
  if (!api?.basePath) return undefined;

  // For tracks, prefer album artwork
  // For podcast episodes and audiobooks, prefer series/album artwork
  if (
    item.AlbumId &&
    (item.Type === "Audio" ||
      item.Type === "AudioBook" ||
      (item.Type === "Episode" && item.MediaType === "Audio"))
  ) {
    return `${api.basePath}/Items/${item.AlbumId}/Images/Primary?fillWidth=${size}&fillHeight=${size}`;
  }

  // Otherwise use item's own primary image
  return getImageUrl(item, "Primary", api, size, size);
}

/**
 * Get stored artwork for offline content
 * Checks MMKV storage for previously downloaded images
 * @param item The Jellyfin item
 * @returns Data URL for stored image, or undefined if not found
 */
export function getStoredArtwork(item: BaseItemDto): string | undefined {
  // For audio tracks, prefer album artwork (stored with AlbumId as key)
  if (
    item.AlbumId &&
    (item.Type === "Audio" ||
      item.Type === "AudioBook" ||
      (item.Type === "Episode" && item.MediaType === "Audio"))
  ) {
    const albumArtwork = getStoredImage(item.AlbumId);
    if (albumArtwork) return albumArtwork;
  }

  // Try the item's own stored image
  return getStoredImage(item.Id);
}

/**
 * Get stream URL for media
 * Handles both audio and video, and detects plugin content
 */
export function getStreamUrl(
  item: BaseItemDto,
  api?: Api,
  userId?: string,
): string | undefined {
  if (!api?.basePath || !item.Id) return undefined;

  // Check if this is plugin content with a direct URL
  if (item.Path?.startsWith("http")) {
    return item.Path; // YouTube plugin and others provide direct URLs
  }

  // Check if this is audio content (music, podcast, or audiobook)
  const isAudioContent =
    item.Type === "Audio" ||
    item.Type === "AudioBook" ||
    (item.Type === "Episode" && item.MediaType === "Audio");

  // Determine endpoint based on type
  const endpoint = isAudioContent ? "Audio" : "Videos";

  // Audio uses universal endpoint with transcoding params
  if (isAudioContent) {
    return `${api.basePath}/${endpoint}/${item.Id}/universal?UserId=${userId || ""}&api_key=${api.accessToken}&MaxStreamingBitrate=140000000&Container=opus,webm|opus,mp3,aac,m4a|aac,m4b|aac,flac,webma,webm|webma,wav,ogg&TranscodingContainer=ts&TranscodingProtocol=http&AudioCodec=aac&EnableRedirection=true&EnableRemoteMedia=false`;
  }

  // Video uses simple stream endpoint
  return `${api.basePath}/${endpoint}/${item.Id}/stream`;
}

/**
 * Create base media entity from Jellyfin BaseItemDto
 * This is used by all domain-specific adapters (music, video)
 */
export function toBaseMediaEntity(
  item: BaseItemDto,
  _downloadInfo?: BaseDownloadInfo | any,
  api?: Api,
): Omit<BaseMediaEntity, "source" | "serverId"> {
  // For artwork: prefer online URL if API available, otherwise check stored images
  const artwork = getArtworkUrl(item, api) ?? getStoredArtwork(item);

  return {
    id: item.Id!,
    name: item.Name || "Unknown",
    jellyfinItem: item,

    overview: item.Overview ?? undefined,
    year: item.ProductionYear ?? undefined,
    genres: item.Genres ?? undefined,
    communityRating: item.CommunityRating ?? undefined,
    officialRating: item.OfficialRating ?? undefined,

    artwork,
    backdropUrl: getImageUrl(item, "Backdrop", api, 1920),
    logoUrl: getImageUrl(item, "Logo", api),

    userData: mapUserData(item.UserData),
    lastModified: item.DateCreated ? new Date(item.DateCreated) : undefined,
  };
}
