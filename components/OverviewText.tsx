import { TouchableOpacity, View, ViewProps, Platform } from "react-native";
import { Text } from "@/components/common/Text";
import { tc } from "@/utils/textTools";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TVFocusable } from "./common/TVFocusable";

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

  const toggleTextExpansion = () => {
    setLimit((prev) =>
      prev === characterLimit ? text.length : characterLimit,
    );
  };

  const showMoreText =
    limit === characterLimit
      ? t("item_card.show_more")
      : t("item_card.show_less");
  const shouldShowToggle = text.length > characterLimit;

  const content = (
    <View>
      <Text>{tc(text, limit)}</Text>
      {shouldShowToggle && (
        <Text className="text-purple-600 mt-1">{showMoreText}</Text>
      )}
    </View>
  );

  return (
    <View className="flex flex-col" {...props}>
      <Text className="text-lg font-bold mb-2">{t("item_card.overview")}</Text>

      {Platform.isTV && shouldShowToggle ? (
        <TVFocusable hasTVPreferredFocus={false} onSelect={toggleTextExpansion}>
          {content}
        </TVFocusable>
      ) : (
        <TouchableOpacity onPress={toggleTextExpansion}>
          {content}
        </TouchableOpacity>
      )}
    </View>
  );
};
