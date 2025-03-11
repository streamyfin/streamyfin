import { usePlaySettings } from "@/providers/PlaySettingsProvider";
import { writeToLog } from "@/utils/log";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import * as FileSystem from "expo-file-system";
import { useRouter } from "expo-router";
import { useCallback } from "react";

export const getDownloadedFileUrl = async (itemId: string): Promise<string> => {
  const directory = FileSystem.documentDirectory;

  if (!directory) {
    throw new Error("Document directory is not available");
  }

  if (!itemId) {
    throw new Error("Item ID is not available");
  }

  const files = await FileSystem.readDirectoryAsync(directory);
  const path = itemId!;
  const matchingFile = files.find((file) => file.startsWith(path));

  if (!matchingFile) {
    throw new Error(`No file found for item ${path}`);
  }

  return `${directory}${matchingFile}`;
};

export const useDownloadedFileOpener = () => {
  const router = useRouter();
  const { setPlayUrl, setOfflineSettings } = usePlaySettings();

  const openFile = useCallback(
    async (item: BaseItemDto) => {
      try {
        // @ts-expect-error
        router.push("/player/direct-player?offline=true&itemId=" + item.Id);
      } catch (error) {
        writeToLog("ERROR", "Error opening file", error);
        console.error("Error opening file:", error);
      }
    },
    [setOfflineSettings, setPlayUrl, router],
  );

  return { openFile };
};
