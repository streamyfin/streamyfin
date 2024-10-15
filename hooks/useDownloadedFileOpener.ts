// hooks/useFileOpener.ts

import { usePlaySettings } from "@/providers/PlaySettingsProvider";
import { writeToLog } from "@/utils/log";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import * as FileSystem from "expo-file-system";
import { useRouter } from "expo-router";
import { useCallback } from "react";

export const useFileOpener = () => {
  const router = useRouter();
  const { setPlayUrl, setOfflineSettings } = usePlaySettings();

  const openFile = useCallback(async (item: BaseItemDto) => {
    const directory = FileSystem.documentDirectory;

    if (!directory) {
      throw new Error("Document directory is not available");
    }

    if (!item.Id) {
      throw new Error("Item ID is not available");
    }

    try {
      const files = await FileSystem.readDirectoryAsync(directory);
      const path = item.Id!;
      const matchingFile = files.find((file) => file.startsWith(path));

      if (!matchingFile) {
        throw new Error(`No file found for item ${path}`);
      }

      const url = `${directory}${matchingFile}`;

      setOfflineSettings({
        item,
      });
      setPlayUrl(url);

      router.push("/play-offline-video");
    } catch (error) {
      writeToLog("ERROR", "Error opening file", error);
      console.error("Error opening file:", error);
    }
  }, []);

  return { openFile };
};
