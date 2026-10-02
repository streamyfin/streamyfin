import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import CastContext, {
  CastState,
  PlayServicesState,
  useCastDevice,
  useCastState,
  useRemoteMediaClient,
} from "react-native-google-cast";
import {
  RECEIVER_ERROR_WINDOW_MS,
  RECEIVER_MAX_QUEUE_ITEMS,
} from "@/constants/Cast";
import {
  currentReceiverName,
  playOnJellyfinReceiver,
  queueWindow,
  watchReceiverLoadErrors,
} from "@/utils/cast/jellyfinReceiver";
import { receiverLoadErrorMessage } from "@/utils/cast/receiverLoadErrorMessage";
import { logAndCaptureError, writeErrorLog } from "@/utils/log";

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
  const { t } = useTranslation();
  const client = useRemoteMediaClient();
  const castState = useCastState();
  const castDeviceName = useCastDevice()?.friendlyName;

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

      let stopWatchingErrors = () => {};

      try {
        // Check Play Services state (Android)
        const state = await CastContext.getPlayServicesState();
        if (state && state !== PlayServicesState.SUCCESS) {
          CastContext.showPlayServicesErrorDialog(state);
          return false;
        }

        // The receiver reloads each track from the server itself, so the
        // queue is sent as bare item ids; the item cap still guards the 64 KB
        // Cast message limit.
        const queueToSend = queueWindow(
          queue,
          startIndex,
          RECEIVER_MAX_QUEUE_ITEMS,
        );

        // The command resolves once sent; whether the receiver could load the
        // tracks only comes back later, on its message channel.
        stopWatchingErrors = watchReceiverLoadErrors((error, message) => {
          writeErrorLog("Chromecast receiver error", message);
          Alert.alert(
            t("player.client_error"),
            receiverLoadErrorMessage(t, error),
          );
        }, RECEIVER_ERROR_WINDOW_MS);

        // Auto-cast fires on the render the session connects, before the
        // device hook has resolved, so the name is read from the session.
        const receiverName = (await currentReceiverName()) ?? castDeviceName;

        await playOnJellyfinReceiver(
          { api, userId, receiverName },
          queueToSend,
        );

        // Show expanded controls
        CastContext.showExpandedControls();

        return true;
      } catch (error) {
        stopWatchingErrors();
        logAndCaptureError("Casting music queue failed", error);
        // The caller starts a cast and moves on, so nothing else would tell
        // the user the queue never reached the TV.
        Alert.alert(
          t("player.client_error"),
          t("player.chromecast_playback_failed"),
        );
        return false;
      }
    },
    [client, api, userId, castDeviceName, t],
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
