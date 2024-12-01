import {getPrimaryImageUrlById} from "@/utils/jellyfin/image/getPrimaryImageUrlById";
import {BaseItemDto} from "@jellyfin/sdk/lib/generated-client";
import useImageStorage from "@/hooks/useImageStorage";
import {apiAtom} from "@/providers/JellyfinProvider";
import {useAtom} from "jotai";
import {storage} from "@/utils/mmkv";
import {getDownloadedFileUrl} from "@/hooks/useDownloadedFileOpener";
import * as FileSystem from 'expo-file-system';
import {FileInfo} from "expo-file-system";


const useDownloadHelper = () => {
  const [api] = useAtom(apiAtom);
  const {saveImage} = useImageStorage();

  const saveSeriesPrimaryImage = async (item: BaseItemDto) => {
    if (item.Type === "Episode" && item.SeriesId && !storage.getString(item.SeriesId)) {
      await saveImage(item.SeriesId, getPrimaryImageUrlById({ api, id: item.SeriesId }))
    }
  }

  const getDownloadSize = async (
    onNewItemSizeFetched: (item: BaseItemDto, size: number) => void,
    ...items: BaseItemDto[]
  ) => {
    const sizes: number[] = [];

    await Promise.all(items.map(item => {
      return new Promise(async (resolve, reject) => {
        const url = await getDownloadedFileUrl(item.Id!);
        if (url) {
          const fileInfo: FileInfo = await FileSystem.getInfoAsync(url);
          if (fileInfo.exists) {
            onNewItemSizeFetched(item, fileInfo.size)
            sizes.push(fileInfo.size);
            resolve(sizes)
          }
        }
        reject();
      })
    }));

    return sizes.reduce((sum, size) => sum + size, 0);
  }

  return { saveSeriesPrimaryImage, getDownloadSize }
}

export default useDownloadHelper;