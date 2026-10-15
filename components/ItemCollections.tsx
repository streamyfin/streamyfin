import { useTranslation } from "react-i18next";
import type { ViewProps } from "react-native";
import { CardRow } from "@/components/cards/CardRow";
import { useItemCollections } from "@/hooks/useItemCollections";

interface ItemCollectionsProps extends ViewProps {
  itemId?: string | null;
}

/** The collections an item belongs to. Draws nothing when there are none. */
export const ItemCollections: React.FC<ItemCollectionsProps> = ({
  itemId,
  ...props
}) => {
  const { t } = useTranslation();
  const { data: collections } = useItemCollections(itemId);

  // No skeleton while it loads: most items are in no collection, and a row
  // that appears and then collapses moves the page under the user's finger.
  return (
    <CardRow
      {...props}
      title={t("item_card.collections")}
      kind='portrait'
      items={collections}
      hideIfEmpty
    />
  );
};
