import useImageStorage from "@/hooks/useImageStorage";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrlById } from "@/utils/jellyfin/image/getPrimaryImageUrlById";
import { storage } from "@/utils/mmkv";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtom } from "jotai";

const useDownloadHelper = () => {
  const [api] = useAtom(apiAtom);
  const { saveImage } = useImageStorage();

  const saveSeriesPrimaryImage = async (item: BaseItemDto) => {
    console.log(`Attempting to save primary image for item: ${item.Id}`);
    if (
      item.Type === "Episode" &&
      item.SeriesId &&
      !storage.getString(item.SeriesId)
    ) {
      console.log(`Saving primary image for series: ${item.SeriesId}`);
      await saveImage(
        item.SeriesId,
        getPrimaryImageUrlById({ api, id: item.SeriesId }),
      );
      console.log(`Primary image saved for series: ${item.SeriesId}`);
    } else {
      console.log(`Skipping primary image save for item: ${item.Id}`);
    }
  };

  return { saveSeriesPrimaryImage };
};

export default useDownloadHelper;
