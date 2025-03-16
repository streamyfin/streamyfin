import { Text } from "@/components/common/Text";
import React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

export default function page() {
  const { t } = useTranslation();
  return (
    <View className='flex items-center justify-center h-full -mt-12'>
      <Text>{t("live_tv.coming_soon")}</Text>
    </View>
  );
}
