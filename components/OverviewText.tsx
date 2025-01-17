import { TouchableOpacity, View, ViewProps } from "react-native";
import { Text } from "@/components/common/Text";
import { tc } from "@/utils/textTools";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props extends ViewProps {
  text?: string | null;
  characterLimit?: number;
}

export const OverviewText: React.FC<Props> = ({
  text,
  characterLimit = 100,
  ...props
}) => {
  const [limit, setLimit] = useState(characterLimit);
  const { t } = useTranslation();

  if (!text) return null;

  return (
    <View className="flex flex-col" {...props}>
      <Text className="text-lg font-bold mb-2">{t("item_card.overview")}</Text>
      <TouchableOpacity
        onPress={() =>
          setLimit((prev) =>
            prev === characterLimit ? text.length : characterLimit
          )
        }
      >
        <View>
          <Text>{tc(text, limit)}</Text>
          {text.length > characterLimit && (
            <Text className="text-purple-600 mt-1">
              {limit === characterLimit ? t("item_card.show_more") : t("item_card.show_less")}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
};
