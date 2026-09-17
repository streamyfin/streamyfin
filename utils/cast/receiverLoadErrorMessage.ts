import type { TFunction } from "i18next";
import type { ReceiverLoadError } from "@/utils/cast/jellyfinReceiver";

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
