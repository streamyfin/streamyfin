import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
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

  useEffect(() => {
    const subscription = GoogleCast.getSessionManager().onSessionEnded(
      (_session, error) => {
        const ended = lastCast.current;
        lastCast.current = {};

        if (!api?.accessToken || !user?.Id || !ended.deviceName) return;

        reportOrphanedReceiverStop({
          api,
          userId: user.Id,
          deviceName: ended.deviceName,
          // The SDK leaves `error` out only when casting was stopped, which
          // closes the receiver app; anything else may leave the TV playing.
          receiverClosed: !error,
          itemId: ended.itemId,
          playSessionId: ended.playSessionId,
        })
          .then((reported) => {
            if (reported) {
              writeInfoLog(
                `Cast: reported the stop the receiver "${ended.deviceName}" could not`,
              );
            }
          })
          .catch((reportError) =>
            logAndCaptureError(
              "Cast: reporting the receiver stop failed",
              reportError,
            ),
          );
      },
    );

    return () => subscription.remove();
  }, [api, user]);

  return null;
}
