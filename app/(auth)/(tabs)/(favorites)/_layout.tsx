import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { nestedTabPageScreenOptions } from "@/components/stacks/NestedTabPageStack";

export default function SearchLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen
        name='index'
        options={{
          headerShown: !Platform.isTV,
          headerTitle: t("tabs.favorites"),
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      {Object.entries(nestedTabPageScreenOptions).map(([name, options]) => (
        <Stack.Screen key={name} name={name} options={options} />
      ))}
    </Stack>
  );
}
