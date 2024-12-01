import {getPrimaryImageUrlById} from "@/utils/jellyfin/image/getPrimaryImageUrlById";
import {BaseItemDto} from "@jellyfin/sdk/lib/generated-client";
import useImageStorage from "@/hooks/useImageStorage";
import {apiAtom} from "@/providers/JellyfinProvider";
import {useAtom} from "jotai";
import {storage} from "@/utils/mmkv";

const useDownloadHelper = () => {
  const [api] = useAtom(apiAtom);
  const {saveImage} = useImageStorage();

  const saveSeriesPrimaryImage = async (item: BaseItemDto) => {
    if (item.Type === "Episode" && item.SeriesId && !storage.getString(item.SeriesId)) {
      await saveImage(item.SeriesId, getPrimaryImageUrlById({ api, id: item.SeriesId }))
    }
  }

  return { saveSeriesPrimaryImage }
}

export default useDownloadHelper;