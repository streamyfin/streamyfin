import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtom } from "jotai";
import useImageStorage from "@/hooks/useImageStorage";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getItemImageUrlById } from "@/utils/jellyfin/image/getItemImageUrl";
import { storage } from "@/utils/mmkv";

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
        getItemImageUrlById(api, item.SeriesId, "Primary", {
          width: 500,
          pixels: true,
        }),
      );
    }
  };

  return { saveSeriesPrimaryImage };
};

export default useDownloadHelper;
