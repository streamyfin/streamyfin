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
    case "playback_info_failed":
      return t("player.chromecast_playback_request_failed");
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

const RECEIVER_LOAD_ERRORS = new Set<string>([
  "playback_info_failed",
  "playback_failed",
  "rejected",
] satisfies ReceiverLoadError[]);

/**
 * User-facing text for an error the remote engine reports: one of the receiver's load errors as such, any other
 * text (a playback error the receiver stopped on) as a failed playback.
 */
export const remoteErrorMessage = (
  t: TFunction,
  error: string | null | undefined,
): string =>
  error && RECEIVER_LOAD_ERRORS.has(error)
    ? receiverLoadErrorMessage(t, error as ReceiverLoadError)
    : t("player.chromecast_playback_failed");
