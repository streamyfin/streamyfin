import {getPrimaryImageUrlById} from "@/utils/jellyfin/image/getPrimaryImageUrlById";
import {BaseItemDto} from "@jellyfin/sdk/lib/generated-client";
import useImageStorage from "@/hooks/useImageStorage";
import {apiAtom} from "@/providers/JellyfinProvider";
import {useAtom} from "jotai";
import {storage} from "@/utils/mmkv";
import {getDownloadedFileUrl} from "@/hooks/useDownloadedFileOpener";
import * as FileSystem from 'expo-file-system'
import {FileInfo} from "expo-file-system";

const useDownloadHelper = () => {
  const [api] = useAtom(apiAtom);
  const {saveImage} = useImageStorage();

  const saveSeriesPrimaryImage = async (item: BaseItemDto) => {
    if (item.Type === "Episode" && item.SeriesId && !storage.getString(item.SeriesId)) {
      await saveImage(item.SeriesId, getPrimaryImageUrlById({ api, id: item.SeriesId }))
    }
  }

  const getDownloadSize = async (...items: BaseItemDto[]) => {
    const sizes: number[] = [];

    await Promise.all(items.map(item => {
      return new Promise(async (resolve, reject) => {
        const url = await getDownloadedFileUrl(item.Id!);
        if (url) {
          const fileInfo: FileInfo = await FileSystem.getInfoAsync(url);
          sizes.push(fileInfo.size);
          resolve(sizes);
        } else reject();
      })
    }));

    const size = sizes.reduce((sum, size) => sum + size, 0);
    const gb = size / 1e+9;

    if (gb >= 1)
      return `${gb.toFixed(2)} GB`;
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  }

  return { saveSeriesPrimaryImage, getDownloadSize }
}

export default useDownloadHelper;