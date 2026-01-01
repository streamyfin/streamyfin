import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import {
  getAlbumTrackIds,
  getDownloadedAudioById,
  isAlbumDownloaded,
  isArtistDownloaded,
  removeDownloadedTrack,
} from "@/providers/AudioPlayer/database";
import { useDownload } from "@/providers/DownloadProvider";
import { registerAlbumTrack } from "@/providers/Downloads/notifications";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getOrSetDeviceId } from "@/utils/device";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { generateDeviceProfile } from "@/utils/profiles/native";

interface DownloadButtonProps {
  item: BaseItemDto;
  type: "track" | "album" | "artist";
  size?: number;
  color?: string;
  showProgress?: boolean;
  showBadge?: boolean;
}

export function DownloadButton({
  item,
  type,
  size = 24,
  color = "white",
  showProgress = true,
  showBadge = false,
}: DownloadButtonProps) {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const {
    startBackgroundDownload,
    deleteFile,
    downloadedItems,
    processes,
    triggerRefresh,
  } = useDownload();

  const isDownloaded = useMemo(() => {
    if (type === "track") {
      // For tracks, check both the legacy database and the AudioPlayer database
      // (album downloads store tracks in the AudioPlayer database)
      const inLegacyDb = downloadedItems.some((d) => d.item?.Id === item.Id);
      const inAudioDb = getDownloadedAudioById(item.Id || "") !== undefined;
      return inLegacyDb || inAudioDb;
    } else if (type === "album") {
      // For albums, check if any tracks are downloaded
      return isAlbumDownloaded(item.Id || "");
    } else if (type === "artist") {
      // For artists, check using artist ID (new AudioPlayer database)
      return isArtistDownloaded(item.Id || "");
    }
    return false;
  }, [downloadedItems, item.Id, type]);

  const isDownloading = useMemo(() => {
    if (type === "track") {
      // For tracks, check if this specific track is downloading
      return processes.some((p) => p.itemId === item.Id);
    } else if (type === "album") {
      // For albums, check if ANY track in this album is downloading
      return processes.some((p) => {
        const processItem = p.item;
        return (
          processItem?.Type === "Audio" && processItem?.AlbumId === item.Id
        );
      });
    } else if (type === "artist") {
      // For artists, check if ANY track by this artist is downloading
      return processes.some((p) => {
        const processItem = p.item;
        if (processItem?.Type !== "Audio") return false;

        // Check album artist or track artist
        const albumArtist = processItem.AlbumArtist || processItem.Artists?.[0];
        return albumArtist === item.Name;
      });
    }
    return false;
  }, [processes, item.Id, item.Name, type]);

  const handleDownloadTrack = useCallback(
    async (track: BaseItemDto, silent = false) => {
      if (!api || !user?.Id || !track.Id) return;

      try {
        const deviceId = getOrSetDeviceId();

        // Get the audio stream URL with proper device profile
        const streamDetails = await getStreamUrl({
          api,
          userId: user.Id,
          item: track,
          startTimeTicks: 0,
          audioStreamIndex: 0,
          maxStreamingBitrate: 320000, // 320kbps for audio
          deviceProfile: generateDeviceProfile(),
          deviceId,
        });

        if (!streamDetails?.url) {
          console.error("[DownloadButton] Could not get stream URL for track");
          return;
        }

        // Use the media source returned from getStreamUrl, or create a minimal one
        const mediaSource = streamDetails.mediaSource || {
          Id: track.Id,
          Path: streamDetails.url,
          Protocol: "Http" as const,
          Container: "mp3",
          RunTimeTicks: track.RunTimeTicks,
        };

        await startBackgroundDownload(
          streamDetails.url,
          track,
          mediaSource,
          {
            key: "320kbps",
            value: 320000,
          },
          silent,
        );
      } catch (error) {
        console.error("[DownloadButton] Error downloading track:", error);
      }
    },
    [api, user, startBackgroundDownload],
  );

  const handleDownloadAlbum = useCallback(
    async (albumId: string) => {
      if (!api || !user?.Id) return;

      try {
        // Fetch all tracks in the album
        const response = await getItemsApi(api).getItems({
          userId: user.Id,
          parentId: albumId,
          includeItemTypes: ["Audio"],
          sortBy: ["ParentIndexNumber", "IndexNumber", "SortName"],
          recursive: true,
        });

        const tracks = response.data.Items || [];

        if (tracks.length === 0) {
          console.warn("[DownloadButton] No tracks found in album");
          return;
        }

        // Register the album download to group notifications
        const albumName = item.Name || "Unknown Album";
        const artistName =
          item.AlbumArtist || item.Artists?.[0] || "Unknown Artist";
        registerAlbumTrack(albumId, albumName, artistName, tracks.length);
        console.log(
          `[DownloadButton] Registered album download: ${albumName} (${tracks.length} tracks)`,
        );

        // Show single notification for album download start
        const { toast } = await import("sonner-native");
        toast.success(`Downloading ${albumName} (${tracks.length} tracks)`);

        // Download all tracks silently (don't stop if one fails)
        for (const track of tracks) {
          try {
            await handleDownloadTrack(track, true); // silent = true
          } catch (error) {
            console.error(
              `[DownloadButton] Failed to download track ${track.Name}:`,
              error,
            );
            // Continue with next track
          }
        }
      } catch (error) {
        console.error("[DownloadButton] Error downloading album:", error);
      }
    },
    [api, user, item, handleDownloadTrack],
  );

  const handleDownloadArtist = useCallback(
    async (artistId: string) => {
      if (!api || !user?.Id) return;

      try {
        // Fetch all tracks by the artist
        const response = await getItemsApi(api).getItems({
          userId: user.Id,
          artistIds: [artistId],
          includeItemTypes: ["Audio"],
          recursive: true,
        });

        const tracks = response.data.Items || [];

        if (tracks.length === 0) {
          console.warn("[DownloadButton] No tracks found for artist");
          return;
        }

        // Group tracks by album to register each album separately
        const albumMap = new Map<
          string,
          { tracks: BaseItemDto[]; albumName: string; artistName: string }
        >();
        for (const track of tracks) {
          const albumId = track.AlbumId || "unknown";
          if (!albumMap.has(albumId)) {
            albumMap.set(albumId, {
              tracks: [],
              albumName: track.Album || "Unknown Album",
              artistName: track.AlbumArtist || item.Name || "Unknown Artist",
            });
          }
          albumMap.get(albumId)!.tracks.push(track);
        }

        // Register each album for grouped notifications
        for (const [albumId, albumData] of albumMap) {
          registerAlbumTrack(
            albumId,
            albumData.albumName,
            albumData.artistName,
            albumData.tracks.length,
          );
          console.log(
            `[DownloadButton] Registered album: ${albumData.albumName} (${albumData.tracks.length} tracks)`,
          );
        }

        // Show single notification for artist download start
        const { toast } = await import("sonner-native");
        const artistName = item.Name || "Unknown Artist";
        toast.success(
          `Downloading ${artistName} (${tracks.length} tracks, ${albumMap.size} albums)`,
        );

        // Download all tracks silently (don't stop if one fails)
        for (const track of tracks) {
          try {
            await handleDownloadTrack(track, true); // silent = true
          } catch (error) {
            console.error(
              `[DownloadButton] Failed to download track ${track.Name}:`,
              error,
            );
            // Continue with next track
          }
        }
      } catch (error) {
        console.error("[DownloadButton] Error downloading artist:", error);
      }
    },
    [api, user, item, handleDownloadTrack],
  );

  const handlePress = useCallback(async () => {
    if (!item.Id) return;

    if (isDownloaded) {
      // Delete download
      if (type === "album") {
        // Delete all tracks in the album
        const trackIds = getAlbumTrackIds(item.Id);
        for (const trackId of trackIds) {
          // Delete from old database (file deletion)
          await deleteFile(trackId);
          // Also remove from new AudioPlayer database
          removeDownloadedTrack(trackId);
        }
        // Force UI update after deleting all tracks
        triggerRefresh();
      } else if (type === "track") {
        // Delete from old database (file deletion)
        await deleteFile(item.Id);
        // Also remove from new AudioPlayer database
        removeDownloadedTrack(item.Id);
      } else {
        // Artist - use existing logic
        await deleteFile(item.Id);
      }
    } else {
      // Start download
      if (type === "track") {
        await handleDownloadTrack(item);
      } else if (type === "album") {
        await handleDownloadAlbum(item.Id);
      } else if (type === "artist") {
        await handleDownloadArtist(item.Id);
      }
    }
  }, [
    item,
    type,
    isDownloaded,
    deleteFile,
    handleDownloadTrack,
    handleDownloadAlbum,
    handleDownloadArtist,
    triggerRefresh,
  ]);

  if (isDownloading && showProgress) {
    return (
      <View
        style={{
          width: size,
          height: size,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size='small' color={color} />
      </View>
    );
  }

  const badgeText = type === "track" ? "1" : type === "album" ? "A" : null;

  return (
    <TouchableOpacity onPress={handlePress} style={{ position: "relative" }}>
      <Ionicons
        name={isDownloaded ? "checkmark-circle" : "arrow-down-circle-outline"}
        size={size}
        color={isDownloaded ? "#22c55e" : color}
      />
      {showBadge && badgeText && !isDownloaded && (
        <View
          style={{
            position: "absolute",
            bottom: -2,
            right: -2,
            width: size * 0.5,
            height: size * 0.5,
            borderRadius: size * 0.25,
            backgroundColor: "#9333ea",
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 1.5,
            borderColor: "#0a0a0a",
          }}
        >
          <Text
            style={{
              fontSize: size * 0.32,
              fontWeight: "bold",
              color: "white",
            }}
          >
            {badgeText}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
