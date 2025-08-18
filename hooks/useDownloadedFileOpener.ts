import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { usePlaySettings } from "@/providers/PlaySettingsProvider";
import { writeToLog } from "@/utils/log";

export const useDownloadedFileOpener = () => {
  const router = useRouter();
  const { setPlayUrl, setOfflineSettings } = usePlaySettings();

  const openFile = useCallback(
    async (item: BaseItemDto) => {
      if (!item.Id) {
        writeToLog("ERROR", "Attempted to open a file without an ID.");
        console.error("Attempted to open a file without an ID.");
        return;
      }
      const queryParams = new URLSearchParams({
        itemId: item.Id,
        offline: "true",
        playbackPosition:
          item.UserData?.PlaybackPositionTicks?.toString() ?? "0",
      });
      try {
        router.push(`/player/direct-player?${queryParams.toString()}`);
      } catch (error) {
        writeToLog("ERROR", "Error opening file", error);
        console.error("Error opening file:", error);
      }
    },
    [setOfflineSettings, setPlayUrl, router],
  );

  return { openFile };
};
