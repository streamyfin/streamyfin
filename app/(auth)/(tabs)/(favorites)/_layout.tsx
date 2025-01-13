import { nestedTabPageScreenOptions } from "@/components/stacks/NestedTabPageStack";
import { Stack } from "expo-router";
import { Platform } from "react-native";
import { t } from "i18next";

export default function SearchLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          headerLargeTitle: true,
          headerTitle: t("tabs.favorites"),
          headerLargeStyle: {
            backgroundColor: "black",
          },
          headerBlurEffect: "prominent",
          headerTransparent: Platform.OS === "ios" ? true : false,
          headerShadowVisible: false,
        }}
      />
      {Object.entries(nestedTabPageScreenOptions).map(([name, options]) => (
        <Stack.Screen key={name} name={name} options={options} />
      ))}
    </Stack>
  );
}
