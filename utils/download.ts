import { getPrimaryImageUrlById } from "@/utils/jellyfin/image/getPrimaryImageUrlById";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import useImageStorage from "@/hooks/useImageStorage";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useAtom } from "jotai";
import { storage } from "@/utils/mmkv";
import * as FileSystem from "expo-file-system";
import { FileInfo } from "expo-file-system";
import { getDownloadedFileUrl } from "@/hooks/useDownloadedFileOpener";

const useDownloadHelper = () => {
  const [api] = useAtom(apiAtom);
  const { saveImage } = useImageStorage();

  const saveSeriesPrimaryImage = async (item: BaseItemDto) => {
    if (
      item.Type === "Episode" &&
      item.SeriesId &&
      !storage.getString(item.SeriesId)
    ) {
      await saveImage(
        item.SeriesId,
        getPrimaryImageUrlById({ api, id: item.SeriesId })
      );
    }
  };

  const getDownloadSize = async (...items: BaseItemDto[]) => {
    const sizes: number[] = [];

    await Promise.all(
      items.map((item) => {
        return new Promise(async (resolve, reject) => {
          const cacheKey = `downloadSize_${item.Id}`;
          const cachedSize = storage.getNumber(cacheKey);

          if (cachedSize !== undefined && cachedSize !== null) {
            sizes.push(cachedSize);
            resolve(sizes);
            return;
          }

          const url = await getDownloadedFileUrl(item.Id!);
          if (url) {
            const fileInfo: FileInfo = await FileSystem.getInfoAsync(url);

            if (fileInfo.exists) {
              sizes.push(fileInfo.size);
              storage.set(cacheKey, fileInfo.size); // Cache the size
              resolve(sizes);
            } else {
              reject(new Error(`File does not exist at ${url}.`));
            }
          } else {
            reject(new Error("Failed to get download URL."));
          }
        });
      })
    );

    const size = sizes.reduce((sum, size) => sum + size, 0);
    const gb = size / 1e9;

    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  };

  return { saveSeriesPrimaryImage, getDownloadSize };
};

export default useDownloadHelper;
