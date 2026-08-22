import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import type React from "react";
import { useTranslation } from "react-i18next";
import type { ViewProps } from "react-native";
import { CardRow } from "@/components/cards/CardRow";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

interface Props extends ViewProps {
  actorId: string;
  actorName?: string | null;
  currentItem: BaseItemDto;
}

export const MoreMoviesWithActor: React.FC<Props> = ({
  actorId,
  actorName,
  currentItem,
  ...props
}) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { t } = useTranslation();

  const { data: items, isLoading } = useQuery({
    queryKey: ["actor", "movies", actorId, currentItem.Id],
    queryFn: async () => {
      if (!api || !user?.Id) return [];
      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        personIds: [actorId],
        limit: 20,
        sortOrder: ["Descending"],
        includeItemTypes: ["Movie", "Series"],
        recursive: true,
        fields: ["ParentId", "PrimaryImageAspectRatio"],
        sortBy: ["PremiereDate"],
        collapseBoxSetItems: false,
        excludeItemIds: [currentItem.SeriesId || "", currentItem.Id || ""],
      });

      // Remove duplicates based on item ID
      const uniqueItems =
        response.data.Items?.reduce((acc, current) => {
          const x = acc.find((item) => item.Id === current.Id);
          if (!x) {
            return acc.concat([current]);
          }
          return acc;
        }, [] as BaseItemDto[]) || [];

      return uniqueItems;
    },
    enabled: !!api && !!user?.Id && !!actorId,
  });

  return (
    <CardRow
      enableActionSheet
      {...props}
      title={t("item_card.more_with", { name: actorName ?? "" })}
      kind='portrait'
      items={items ?? []}
      loading={isLoading}
      hideIfEmpty
    />
  );
};
