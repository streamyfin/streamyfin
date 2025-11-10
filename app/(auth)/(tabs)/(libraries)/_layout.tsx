import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { nestedTabPageScreenOptions } from "@/components/stacks/NestedTabPageStack";
import { useSettings } from "@/utils/atoms/settings";

export default function IndexLayout() {
  const { settings, updateSettings, pluginSettings } = useSettings();

  const { t } = useTranslation();

  if (!settings?.libraryOptions) return null;

  return (
    <Stack>
      <Stack.Screen
        name='index'
        options={{
          headerShown: !Platform.isTV,
          headerTitle: t("tabs.library"),
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
          headerRight: () =>
            !pluginSettings?.libraryOptions?.locked &&
            !Platform.isTV && (
              <PlatformDropdown
                trigger={
                  <View className='pl-1.5'>
                    <Ionicons
                      name='ellipsis-horizontal-outline'
                      size={24}
                      color='white'
                    />
                  </View>
                }
                title={t("library.options.display")}
                groups={[
                  {
                    title: t("library.options.display"),
                    options: [
                      {
                        type: "radio",
                        label: t("library.options.row"),
                        value: "row",
                        selected: settings.libraryOptions.display === "row",
                        onPress: () =>
                          updateSettings({
                            libraryOptions: {
                              ...settings.libraryOptions,
                              display: "row",
                            },
                          }),
                      },
                      {
                        type: "radio",
                        label: t("library.options.list"),
                        value: "list",
                        selected: settings.libraryOptions.display === "list",
                        onPress: () =>
                          updateSettings({
                            libraryOptions: {
                              ...settings.libraryOptions,
                              display: "list",
                            },
                          }),
                      },
                    ],
                  },
                  {
                    title: t("library.options.image_style"),
                    options: [
                      {
                        type: "radio",
                        label: t("library.options.poster"),
                        value: "poster",
                        selected:
                          settings.libraryOptions.imageStyle === "poster",
                        onPress: () =>
                          updateSettings({
                            libraryOptions: {
                              ...settings.libraryOptions,
                              imageStyle: "poster",
                            },
                          }),
                      },
                      {
                        type: "radio",
                        label: t("library.options.cover"),
                        value: "cover",
                        selected:
                          settings.libraryOptions.imageStyle === "cover",
                        onPress: () =>
                          updateSettings({
                            libraryOptions: {
                              ...settings.libraryOptions,
                              imageStyle: "cover",
                            },
                          }),
                      },
                    ],
                  },
                  {
                    title: "Options",
                    options: [
                      {
                        type: "toggle",
                        label: t("library.options.show_titles"),
                        value: settings.libraryOptions.showTitles,
                        onToggle: () =>
                          updateSettings({
                            libraryOptions: {
                              ...settings.libraryOptions,
                              showTitles: !settings.libraryOptions.showTitles,
                            },
                          }),
                        disabled:
                          settings.libraryOptions.imageStyle === "poster",
                      },
                      {
                        type: "toggle",
                        label: t("library.options.show_stats"),
                        value: settings.libraryOptions.showStats,
                        onToggle: () =>
                          updateSettings({
                            libraryOptions: {
                              ...settings.libraryOptions,
                              showStats: !settings.libraryOptions.showStats,
                            },
                          }),
                      },
                    ],
                  },
                ]}
              />
            ),
        }}
      />
      <Stack.Screen
        name='[libraryId]'
        options={{
          title: "",
          headerShown: !Platform.isTV,
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
    </Stack>
  );
}
