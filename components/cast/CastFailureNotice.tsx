import { useStore } from "jotai";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Alert, type AlertButton, AppState } from "react-native";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { userAtom } from "@/utils/atoms/api";
import { effectiveSettingsAtom } from "@/utils/atoms/settings";
import { isLatestPlayChoice } from "@/utils/cast/playTarget";
import {
  type CastPlaybackFailure,
  onCastPlaybackFailed,
} from "@/utils/cast/watchLoadedCast";
import { logAndCaptureError, writeErrorLog } from "@/utils/log";
import { onAppForeground } from "@/utils/onAppForeground";

/**
 * Says so when the receiver stops with an error on a video this phone sent, and offers to play it here from where
 * the receiver played it: the player that handed it off closed at the load answer, and the page that sent it may
 * be gone. Not once the user chose another play or another account since. A SyncPlay member and an audio item
 * only hear of it. Mounted once at the root, like OutputPickerActions. Renders nothing.
 */
export function CastFailureNotice() {
  const { t } = useTranslation();
  const store = useStore();
  const playMedia = usePlayMedia();
  const syncPlay = useSyncPlay();
  // Read when the receiver fails, which can come long after the render that subscribed.
  const latest = useRef({ playMedia, inGroup: syncPlay.enabled, t });
  useLayoutEffect(() => {
    latest.current = { playMedia, inGroup: syncPlay.enabled, t };
  }, [playMedia, syncPlay.enabled, t]);

  useEffect(() => {
    const tell = (failure: CastPlaybackFailure) => {
      // Played here or elsewhere since, or another account: the receiver's failure is old news.
      if (
        !isLatestPlayChoice(failure.choice) ||
        store.get(userAtom)?.Id !== failure.userId
      ) {
        return;
      }
      const { t, inGroup } = latest.current;
      const canPlayHere = !inGroup && failure.item.MediaType !== "Audio";
      const failed = t("cast.output.receiver_failed", {
        title: failure.item.Name,
      });
      const buttons: AlertButton[] = [
        { text: t("common.ok"), style: "cancel" },
      ];
      if (canPlayHere) {
        buttons.push({
          text: t("player.play_here"),
          onPress: () => {
            latest.current
              .playMedia(
                {
                  ...failure.request,
                  bitrateValue: store.get(effectiveSettingsAtom).defaultBitrate
                    ?.value,
                  offline: false,
                },
                { item: failure.item },
              )
              .catch((error) => {
                logAndCaptureError(
                  "The video the receiver failed on did not play here",
                  error,
                );
              });
          },
        });
      }
      Alert.alert(
        t("cast.output.receiver_failed_title", { name: failure.receiverName }),
        canPlayHere
          ? `${failed} ${t("cast.output.receiver_failed_play_here")}`
          : failed,
        buttons,
      );
    };

    // The latest failure that came while the app was away, told once it is back.
    let waiting: CastPlaybackFailure | null = null;
    const failures = onCastPlaybackFailed((failure) => {
      writeErrorLog("The receiver stopped on a playback error", {
        itemId: failure.item.Id,
      });
      // On Android the Cast remote is an activity of its own, which pauses the app's: an alert asked for then is
      // lost (React Native keeps it on a helper it throws away), so it waits, and is weighed again then.
      if (AppState.currentState === "active") tell(failure);
      else waiting = failure;
    });
    const stopWaiting = onAppForeground(() => {
      const failure = waiting;
      waiting = null;
      if (failure) tell(failure);
    });
    return () => {
      failures.remove();
      stopWaiting();
    };
  }, [store]);

  return null;
}
