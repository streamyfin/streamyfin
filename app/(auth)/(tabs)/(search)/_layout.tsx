import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import {
  commonScreenOptions,
  nestedTabPageScreenOptions,
} from "@/components/stacks/NestedTabPageStack";

export default function SearchLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen
        name='index'
        options={{
          headerShown: !Platform.isTV,
          headerTitle: t("tabs.search"),
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      {Object.entries(nestedTabPageScreenOptions).map(([name, options]) => (
        <Stack.Screen key={name} name={name} options={options} />
      ))}
      <Stack.Screen
        name='collections/[collectionId]'
        options={{
          title: "",
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen name='seerr/page' options={commonScreenOptions} />
      <Stack.Screen
        name='seerr/person/[personId]'
        options={commonScreenOptions}
      />
      <Stack.Screen
        name='seerr/company/[companyId]'
        options={commonScreenOptions}
      />
      <Stack.Screen
        name='seerr/genre/[genreId]'
        options={commonScreenOptions}
      />
    </Stack>
  );
}
