import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useCallback } from "react";
import CastContext, {
  CastState,
  PlayServicesState,
  useCastState,
  useRemoteMediaClient,
} from "react-native-google-cast";
import { getAudioContentType } from "@/utils/jellyfin/audio/getAudioContentType";
import { getAudioStreamUrl } from "@/utils/jellyfin/audio/getAudioStreamUrl";

interface UseMusicCastOptions {
  api: Api | null;
  userId: string | undefined;
}

interface CastQueueOptions {
  queue: BaseItemDto[];
  startIndex: number;
}

/**
 * Hook for casting music to Chromecast with full queue support
 */
export const useMusicCast = ({ api, userId }: UseMusicCastOptions) => {
  const client = useRemoteMediaClient();
  const castState = useCastState();

  const isConnected = castState === CastState.CONNECTED;

  /**
   * Get album art URL for a track
   */
  const getAlbumArtUrl = useCallback(
    (track: BaseItemDto): string | undefined => {
      if (!api) return undefined;
      const albumId = track.AlbumId || track.ParentId;
      if (albumId) {
        return `${api.basePath}/Items/${albumId}/Images/Primary?maxHeight=600&maxWidth=600`;
      }
      return `${api.basePath}/Items/${track.Id}/Images/Primary?maxHeight=600&maxWidth=600`;
    },
    [api],
  );

  /**
   * Cast a queue of tracks to Chromecast
   * Uses native queue support for seamless track transitions
   */
  const castQueue = useCallback(
    async ({ queue, startIndex }: CastQueueOptions): Promise<boolean> => {
      if (!client || !api || !userId) {
        console.warn("Cannot cast: missing client, api, or userId");
        return false;
      }

      try {
        // Check Play Services state (Android)
        const state = await CastContext.getPlayServicesState();
        if (state && state !== PlayServicesState.SUCCESS) {
          CastContext.showPlayServicesErrorDialog(state);
          return false;
        }

        // Build queue items - limit to 100 tracks due to Cast SDK message size limit
        const queueToSend = queue.slice(0, 100);
        const queueItems = await Promise.all(
          queueToSend.map(async (track) => {
            const streamResult = await getAudioStreamUrl(
              api,
              userId,
              track.Id!,
            );
            if (!streamResult) {
              throw new Error(
                `Failed to get stream URL for track: ${track.Name}`,
              );
            }

            const contentType = getAudioContentType(
              streamResult.mediaSource?.Container,
            );

            return {
              mediaInfo: {
                contentUrl: streamResult.url,
                contentType,
                metadata: {
                  type: "musicTrack" as const,
                  title: track.Name || "Unknown Track",
                  artist: track.AlbumArtist || track.Artists?.join(", ") || "",
                  albumName: track.Album || "",
                  images: getAlbumArtUrl(track)
                    ? [{ url: getAlbumArtUrl(track)! }]
                    : [],
                },
              },
              autoplay: true,
              preloadTime: 10, // Preload 10 seconds before track ends
            };
          }),
        );

        // Load media with queue
        await client.loadMedia({
          queueData: {
            items: queueItems,
            startIndex: Math.min(startIndex, queueItems.length - 1),
          },
        });

        // Show expanded controls
        CastContext.showExpandedControls();

        return true;
      } catch (error) {
        console.error("Failed to cast music queue:", error);
        return false;
      }
    },
    [client, api, userId, getAlbumArtUrl],
  );

  /**
   * Cast a single track to Chromecast
   */
  const castTrack = useCallback(
    async (track: BaseItemDto): Promise<boolean> => {
      return castQueue({ queue: [track], startIndex: 0 });
    },
    [castQueue],
  );

  /**
   * Stop casting and disconnect
   */
  const stopCasting = useCallback(async () => {
    if (client) {
      await client.stop();
    }
  }, [client]);

  return {
    client,
    isConnected,
    castState,
    castQueue,
    castTrack,
    stopCasting,
  };
};
