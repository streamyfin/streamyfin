import type { TFunction } from "i18next";
import type {
  ReceiverLoadError,
  ReceiverLoadOutcome,
} from "@/utils/cast/jellyfinReceiver";

/** User-facing text for a load error the Jellyfin receiver sent back. */
export const receiverLoadErrorMessage = (
  t: TFunction,
  error: ReceiverLoadError,
): string => {
  switch (error) {
    case "server_unreachable":
      return t("player.chromecast_server_unreachable");
    case "playback_failed":
      return t("player.chromecast_playback_failed");
    default:
      return t("player.could_not_create_stream_for_chromecast");
  }
};

/**
 * Why a cast did not start, for the user, or null when it did start or a
 * newer cast replaced it.
 */
export const castNotStartedMessage = (
  t: TFunction,
  outcome: ReceiverLoadOutcome,
): string | null => {
  switch (outcome.status) {
    case "failed":
      return receiverLoadErrorMessage(t, outcome.error);
    case "timed_out":
      return t("player.chromecast_did_not_start");
    default:
      return null;
  }
};
