import index from "@/app/(auth)/(tabs)/(home)";
import { apiAtom } from "@/providers/JellyfinProvider";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api/items-api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";

interface AdjacentEpisodesProps {
  item?: BaseItemDto | null;
}

export const useAdjacentItems = ({ item }: AdjacentEpisodesProps) => {
  const api = useAtomValue(apiAtom);

  const { data: previousItem } = useQuery({
    queryKey: ["previousItem", item?.Id, item?.ParentId, item?.IndexNumber],
    queryFn: async (): Promise<BaseItemDto | null> => {
      const parentId = item?.AlbumId || item?.ParentId;
      const indexNumber = item?.IndexNumber;

      if (
        !api ||
        !parentId ||
        indexNumber === undefined ||
        indexNumber === null ||
        indexNumber - 1 < 1
      ) {
        return null;
      }

      const newIndexNumber = indexNumber - 2;

      const res = await getItemsApi(api).getItems({
        parentId: parentId!,
        startIndex: newIndexNumber,
        limit: 1,
        sortBy: ["IndexNumber"],
        includeItemTypes: ["Episode", "Audio"],
        fields: ["MediaSources", "MediaStreams", "ParentId"],
      });

      if (res.data.Items?.[0]?.IndexNumber !== indexNumber - 1) {
        throw new Error("Previous item is not correct");
      }

      return res.data.Items?.[0] || null;
    },
    enabled: item?.Type === "Episode" || item?.Type === "Audio",
    staleTime: 0,
  });

  const { data: nextItem } = useQuery({
    queryKey: ["nextItem", item?.Id, item?.ParentId, item?.IndexNumber],
    queryFn: async (): Promise<BaseItemDto | null> => {
      const parentId = item?.AlbumId || item?.ParentId;
      const indexNumber = item?.IndexNumber;

      if (
        !api ||
        !parentId ||
        indexNumber === undefined ||
        indexNumber === null
      ) {
        console.log("No next item", {
          itemId: item?.Id,
          parentId: parentId,
          indexNumber: indexNumber,
        });
        return null;
      }

      const res = await getItemsApi(api).getItems({
        parentId: parentId!,
        startIndex: indexNumber,
        sortBy: ["IndexNumber"],
        limit: 1,
        includeItemTypes: ["Episode", "Audio"],
        fields: ["MediaSources", "MediaStreams", "ParentId"],
      });

      if (res.data.Items?.[0]?.IndexNumber !== indexNumber + 1) {
        throw new Error("Previous item is not correct");
      }

      return res.data.Items?.[0] || null;
    },
    enabled: item?.Type === "Episode" || item?.Type === "Audio",
    staleTime: 0,
  });

  return { previousItem, nextItem };
};
