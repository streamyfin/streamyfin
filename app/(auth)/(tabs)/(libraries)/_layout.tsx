import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity } from "react-native";
import { LibraryOptionsSheet } from "@/components/settings/LibraryOptionsSheet";
import { nestedTabPageScreenOptions } from "@/components/stacks/NestedTabPageStack";
import { useSettings } from "@/utils/atoms/settings";

export default function IndexLayout() {
  const { settings, updateSettings, pluginSettings } = useSettings();
  const [optionsSheetOpen, setOptionsSheetOpen] = useState(false);

  const { t } = useTranslation();

  if (!settings?.libraryOptions) return null;

  return (
    <>
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
                <TouchableOpacity
                  onPress={() => setOptionsSheetOpen(true)}
                  className='flex flex-row items-center justify-center w-9 h-9'
                >
                  <Ionicons
                    name='ellipsis-horizontal-outline'
                    size={24}
                    color='white'
                  />
                </TouchableOpacity>
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
      <LibraryOptionsSheet
        open={optionsSheetOpen}
        setOpen={setOptionsSheetOpen}
        settings={settings.libraryOptions}
        updateSettings={(options) =>
          updateSettings({
            libraryOptions: {
              ...settings.libraryOptions,
              ...options,
            },
          })
        }
        disabled={pluginSettings?.libraryOptions?.locked}
      />
    </>
  );
}
