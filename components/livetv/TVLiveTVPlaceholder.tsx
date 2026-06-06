import React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";

interface TVLiveTVPlaceholderProps {
  tabName: string;
}

export const TVLiveTVPlaceholder: React.FC<TVLiveTVPlaceholderProps> = ({
  tabName,
}) => {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 60,
      }}
    >
      <Text
        style={{
          fontSize: typography.title,
          fontWeight: "700",
          color: "#FFFFFF",
          marginBottom: 12,
        }}
      >
        {tabName}
      </Text>
      <Text
        style={{
          fontSize: typography.body,
          color: "rgba(255, 255, 255, 0.6)",
        }}
      >
        {t("live_tv.coming_soon")}
      </Text>
    </View>
  );
};
