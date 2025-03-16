import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { Button } from "../Button";

interface Props extends React.ComponentProps<typeof Button> {
  item: BaseItemDto;
  type?: "next" | "previous";
}

export const NextItemButton: React.FC<Props> = ({
  item,
  type = "next",
  ...props
}) => {
  const router = useRouter();

  const [user] = useAtom(userAtom);
  const [api] = useAtom(apiAtom);

  const { data: nextItem } = useQuery({
    queryKey: ["nextItem", item.Id, item.ParentId, type],
    queryFn: async () => {
      if (
        !api ||
        !user?.Id ||
        !item?.Id ||
        !item?.ParentId ||
        !item?.IndexNumber
      )
        return null;

      const response = await getItemsApi(api).getItems({
        parentId: item?.ParentId,
        limit: 1,
        startIndex: type === "next" ? item.IndexNumber : item.IndexNumber - 2,
      });

      return (response.data.Items?.[0] as BaseItemDto) || null;
    },
    enabled: Boolean(api && user?.Id && item?.Id && item.SeasonId),
  });

  const disabled = useMemo(() => {
    if (!nextItem) return true;
    if (nextItem.Id === item.Id) return true;
    return false;
  }, [nextItem, type]);

  if (item.Type !== "Episode") return null;

  return (
    <Button
      onPress={() => router.setParams({ id: nextItem?.Id })}
      className={`h-12 aspect-square`}
      disabled={disabled}
      {...props}
    >
      {type === "next" ? (
        <Ionicons name='chevron-forward' size={24} color='white' />
      ) : (
        <Ionicons name='chevron-back' size={24} color='white' />
      )}
    </Button>
  );
};
