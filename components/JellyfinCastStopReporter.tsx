import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import GoogleCast, {
  useCastDevice,
  useMediaStatus,
} from "react-native-google-cast";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  reportOrphanedReceiverStop,
  toReceiverDeviceName,
} from "@/utils/cast/reportOrphanedReceiverStop";
import { logAndCaptureError, writeInfoLog } from "@/utils/log";

interface LastCast {
  deviceName?: string;
  itemId?: string;
  playSessionId?: string;
}

/**
 * Mounted once for the whole app: a cast can be stopped from the notification
 * or the native Cast dialog while no casting screen is open. Renders nothing.
 */
export function JellyfinCastStopReporter() {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const castDevice = useCastDevice();
  const mediaStatus = useMediaStatus();

  // The device and media status are already gone by the time the session has
  // ended, so the last values seen are kept for then.
  const lastCast = useRef<LastCast>({});

  useEffect(() => {
    if (castDevice?.friendlyName) {
      lastCast.current.deviceName = toReceiverDeviceName(
        castDevice.friendlyName,
      );
    }
  }, [castDevice]);

  useEffect(() => {
    const customData = mediaStatus?.mediaInfo?.customData as
      | { itemId?: string; playSessionId?: string }
      | undefined;
    if (customData?.itemId) {
      lastCast.current.itemId = customData.itemId;
      lastCast.current.playSessionId = customData.playSessionId;
    }
  }, [mediaStatus]);

  // At most one report runs at a time; the connection-loss path waits long
  // enough for the cast or the account to change underneath it.
  const pendingReport = useRef<AbortController | null>(null);

  const cancelPendingReport = useCallback(() => {
    pendingReport.current?.abort();
    pendingReport.current = null;
  }, []);

  // A pending report belongs to the server and account it started with.
  useEffect(
    () => cancelPendingReport,
    [api?.basePath, api?.accessToken, user?.Id, cancelPendingReport],
  );

  useEffect(() => {
    const sessionManager = GoogleCast.getSessionManager();

    // A new cast on the same TV must not be stopped by a check left over from
    // the previous session.
    const starting = sessionManager.onSessionStarting(() =>
      cancelPendingReport(),
    );

    const ending = sessionManager.onSessionEnded((_session, error) => {
      const last = lastCast.current;
      lastCast.current = {};
      cancelPendingReport();

      if (!api?.accessToken || !user?.Id || !last.deviceName || !last.itemId) {
        return;
      }

      const controller = new AbortController();
      pendingReport.current = controller;

      reportOrphanedReceiverStop({
        api,
        userId: user.Id,
        deviceName: last.deviceName,
        // The SDK leaves `error` out only when casting was stopped, which
        // closes the receiver app; anything else may leave the TV playing.
        receiverClosed: !error,
        itemId: last.itemId,
        playSessionId: last.playSessionId,
        signal: controller.signal,
      })
        .then((reported) => {
          if (reported) {
            writeInfoLog(
              `Cast: reported the stop the receiver "${last.deviceName}" could not`,
            );
          }
        })
        .catch((reportError) => {
          logAndCaptureError(
            "Cast: reporting the receiver stop failed",
            reportError,
          );
        })
        .finally(() => {
          if (pendingReport.current === controller) {
            pendingReport.current = null;
          }
        });
    });

    return () => {
      starting.remove();
      ending.remove();
    };
  }, [api, user, cancelPendingReport]);

  return null;
}
