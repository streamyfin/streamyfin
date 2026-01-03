import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { nestedTabPageScreenOptions } from "@/components/stacks/NestedTabPageStack";
import { useSettings } from "@/utils/atoms/settings";

export default function IndexLayout() {
  const { settings, updateSettings, pluginSettings } = useSettings();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const { t } = useTranslation();

  // Reset dropdown state when component unmounts or navigates away
  useEffect(() => {
    return () => {
      setDropdownOpen(false);
    };
  }, []);

  // Memoize callbacks to prevent recreating on every render
  const handleDisplayRow = useCallback(() => {
    updateSettings({
      libraryOptions: {
        ...settings.libraryOptions,
        display: "row",
      },
    });
  }, [settings.libraryOptions, updateSettings]);

  const handleDisplayList = useCallback(() => {
    updateSettings({
      libraryOptions: {
        ...settings.libraryOptions,
        display: "list",
      },
    });
  }, [settings.libraryOptions, updateSettings]);

  const handleImageStylePoster = useCallback(() => {
    updateSettings({
      libraryOptions: {
        ...settings.libraryOptions,
        imageStyle: "poster",
      },
    });
  }, [settings.libraryOptions, updateSettings]);

  const handleImageStyleCover = useCallback(() => {
    updateSettings({
      libraryOptions: {
        ...settings.libraryOptions,
        imageStyle: "cover",
      },
    });
  }, [settings.libraryOptions, updateSettings]);

  const handleToggleTitles = useCallback(() => {
    updateSettings({
      libraryOptions: {
        ...settings.libraryOptions,
        showTitles: !settings.libraryOptions.showTitles,
      },
    });
  }, [settings.libraryOptions, updateSettings]);

  const handleToggleStats = useCallback(() => {
    updateSettings({
      libraryOptions: {
        ...settings.libraryOptions,
        showStats: !settings.libraryOptions.showStats,
      },
    });
  }, [settings.libraryOptions, updateSettings]);

  // Memoize groups to prevent recreating the array on every render
  const dropdownGroups = useMemo(
    () => [
      {
        title: t("library.options.display"),
        options: [
          {
            type: "radio" as const,
            label: t("library.options.row"),
            value: "row",
            selected: settings.libraryOptions.display === "row",
            onPress: handleDisplayRow,
          },
          {
            type: "radio" as const,
            label: t("library.options.list"),
            value: "list",
            selected: settings.libraryOptions.display === "list",
            onPress: handleDisplayList,
          },
        ],
      },
      {
        title: t("library.options.image_style"),
        options: [
          {
            type: "radio" as const,
            label: t("library.options.poster"),
            value: "poster",
            selected: settings.libraryOptions.imageStyle === "poster",
            onPress: handleImageStylePoster,
          },
          {
            type: "radio" as const,
            label: t("library.options.cover"),
            value: "cover",
            selected: settings.libraryOptions.imageStyle === "cover",
            onPress: handleImageStyleCover,
          },
        ],
      },
      {
        title: "Options",
        options: [
          {
            type: "toggle" as const,
            label: t("library.options.show_titles"),
            value: settings.libraryOptions.showTitles,
            onToggle: handleToggleTitles,
            disabled: settings.libraryOptions.imageStyle === "poster",
          },
          {
            type: "toggle" as const,
            label: t("library.options.show_stats"),
            value: settings.libraryOptions.showStats,
            onToggle: handleToggleStats,
          },
        ],
      },
    ],
    [
      t,
      settings.libraryOptions,
      handleDisplayRow,
      handleDisplayList,
      handleImageStylePoster,
      handleImageStyleCover,
      handleToggleTitles,
      handleToggleStats,
    ],
  );

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
                open={dropdownOpen}
                onOpenChange={setDropdownOpen}
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
                groups={dropdownGroups}
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
