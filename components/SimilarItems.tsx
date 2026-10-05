import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useTranslation } from "react-i18next";
import type { ViewProps } from "react-native";
import { CardRow } from "@/components/cards/CardRow";
import { useSimilarItems } from "@/hooks/useSimilarItems";

interface SimilarItemsProps extends ViewProps {
  item?: Pick<BaseItemDto, "Id" | "Type"> | null;
}

export const SimilarItems: React.FC<SimilarItemsProps> = ({
  item,
  ...props
}) => {
  const { t } = useTranslation();
  const { data: similarItems, isLoading } = useSimilarItems(item);

  return (
    <CardRow
      enableActionSheet
      {...props}
      title={t("item_card.similar_items")}
      kind='portrait'
      items={similarItems}
      loading={isLoading}
      emptyText={t("item_card.no_similar_items_found")}
    />
  );
};
