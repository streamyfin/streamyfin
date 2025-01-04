import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { MMKV } from "react-native-mmkv";

const storage = new MMKV();

const saveItemMapping = (itemId: string | undefined, fileName: string) => {
  if (!itemId) return;
  storage.set(itemId, fileName);
};

const getFilePathFromItemId = (itemId: string): string | undefined => {
  return storage.getString(itemId);
};

const formatItemName = (item: BaseItemDto) => {
  if (item.Type === "Episode") {
    const formattedParentIndexNumber = (item.ParentIndexNumber ?? 0)
      .toString()
      .padStart(2, "0");
    const formattedIndexNumber = (item.IndexNumber ?? 0)
      .toString()
      .padStart(2, "0");

    const formattedString = `S${formattedParentIndexNumber}E${formattedIndexNumber}`;
    return `${item.SeriesName} - ${formattedString} - ${item.Name}`;
  }
  return item.Name;
};

export { saveItemMapping, getFilePathFromItemId, storage, formatItemName };
