import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useCallback } from "react";
import CastContext, {
  CastState,
  PlayServicesState,
  useCastDevice,
  useCastState,
  useRemoteMediaClient,
} from "react-native-google-cast";
import { playOnJellyfinReceiver } from "@/utils/cast/jellyfinReceiver";
import { logAndCaptureError } from "@/utils/log";

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
  const receiverName = useCastDevice()?.friendlyName;

  const isConnected = castState === CastState.CONNECTED;

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

        // The receiver reloads each track from the server itself, so the
        // queue is sent as bare item ids; the 100-track cap still guards the
        // 64 KB Cast message limit.
        const queueToSend = queue.slice(0, 100);

        await playOnJellyfinReceiver(
          { api, userId, receiverName },
          {
            items: queueToSend,
            startIndex: Math.min(startIndex, queueToSend.length - 1),
          },
        );

        // Show expanded controls
        CastContext.showExpandedControls();

        return true;
      } catch (error) {
        // Returning false gives the caller no user feedback either, so this
        // is the only trace that casting failed.
        logAndCaptureError("Casting music queue failed", error);
        return false;
      }
    },
    [client, api, userId, receiverName],
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
