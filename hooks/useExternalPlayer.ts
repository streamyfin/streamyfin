import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getPlaystateApi } from "@jellyfin/sdk/lib/utils/api";
import { startActivityAsync } from "expo-intent-launcher";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { usePlaybackManager } from "@/hooks/usePlaybackManager";
import { apiAtom } from "@/utils/atoms/api";
import {
  buildExternalPlayerLaunchParams,
  getExternalPlayerUri,
  readExternalPlayerResult,
} from "@/utils/externalPlayer";
import { writeErrorLog } from "@/utils/log";
import type { PlayRequest } from "@/utils/nativePlayer/playRequest";

const ACTION_VIEW = "android.intent.action.VIEW";
const FLAG_GRANT_READ_URI_PERMISSION = 1;

export interface ExternalPlayerOptions {
  /** Ask which app plays it, even when the user set a default one. */
  chooseApp?: boolean;
}

/**
 * Plays a request in another player app. Resolves false when nothing could be
 * opened, so the caller can fall back to the in-app player; otherwise once the
 * user is back, after reporting the position the other app returned, if it
 * returned one we can read.
 *
 * On Android the user picks the app in the system's "Open with" dialog, which
 * skips itself once a default app is set; `chooseApp` shows it regardless.
 */
export const useExternalPlayer = () => {
  const api = useAtomValue(apiAtom);
  const { isConnected } = useNetworkStatus();
  const { saveLocalPlaybackProgress, markItemPlayed } = usePlaybackManager();
  const { t } = useTranslation();

  return useCallback(
    async (
      req: PlayRequest,
      item?: BaseItemDto | null,
      options?: ExternalPlayerOptions,
    ): Promise<boolean> => {
      const uri = getExternalPlayerUri(api, req);
      if (!uri) return false;

      let extra: object | undefined;
      try {
        ({ extra } = await startActivityAsync(ACTION_VIEW, {
          data: uri,
          type: "video/*",
          flags: FLAG_GRANT_READ_URI_PERMISSION,
          extra: buildExternalPlayerLaunchParams(req, item),
          chooserTitle: options?.chooseApp
            ? t("home.settings.external_player.chooser_title")
            : undefined,
        }));
      } catch (error) {
        writeErrorLog(
          "External player could not be opened",
          error instanceof Error ? error.message : String(error),
        );
        return false;
      }

      const result = readExternalPlayerResult(extra);
      if (!result) return true;
      try {
        if (result.completed) {
          await markItemPlayed(req.itemId);
          return true;
        }
        saveLocalPlaybackProgress({
          ItemId: req.itemId,
          PositionTicks: result.positionTicks,
        });
        // A stop report, not a progress one: the server only applies its
        // played threshold when a session stops.
        if (api && isConnected) {
          await getPlaystateApi(api).reportPlaybackStopped({
            playbackStopInfo: {
              ItemId: req.itemId,
              MediaSourceId: req.mediaSourceId,
              PositionTicks: result.positionTicks,
            },
          });
        }
      } catch (error) {
        writeErrorLog(
          "External player position could not be reported",
          error instanceof Error ? error.message : String(error),
        );
      }
      return true;
    },
    [api, isConnected, saveLocalPlaybackProgress, markItemPlayed, t],
  );
};
