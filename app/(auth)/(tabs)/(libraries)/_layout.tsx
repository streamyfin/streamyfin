import { nestedTabPageScreenOptions } from "@/components/stacks/NestedTabPageStack";
import { useSettings } from "@/utils/atoms/settings";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { Platform } from "react-native";
const DropdownMenu = !Platform.isTV ? require("zeego/dropdown-menu") : null;
import { useTranslation } from "react-i18next";

export default function IndexLayout() {
  const [settings, updateSettings, pluginSettings] = useSettings();

  const { t } = useTranslation();

  if (!settings?.libraryOptions) return null;

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          headerLargeTitle: true,
          headerTitle: t("tabs.library"),
          headerBlurEffect: "prominent",
          headerLargeStyle: {
            backgroundColor: "black",
          },
          headerTransparent: Platform.OS === "ios" ? true : false,
          headerShadowVisible: false,
          headerRight: () =>
            !pluginSettings?.libraryOptions?.locked &&
            !Platform.isTV && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  <Ionicons
                    name="ellipsis-horizontal-outline"
                    size={24}
                    color="white"
                  />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content
                  align={"end"}
                  alignOffset={-10}
                  avoidCollisions={false}
                  collisionPadding={0}
                  loop={false}
                  side={"bottom"}
                  sideOffset={10}
                >
                  <DropdownMenu.Label>
                    {t("library.options.display")}
                  </DropdownMenu.Label>
                  <DropdownMenu.Group key="display-group">
                    <DropdownMenu.Sub>
                      <DropdownMenu.SubTrigger key="image-style-trigger">
                        {t("library.options.display")}
                      </DropdownMenu.SubTrigger>
                      <DropdownMenu.SubContent
                        alignOffset={-10}
                        avoidCollisions={true}
                        collisionPadding={0}
                        loop={true}
                        sideOffset={10}
                      >
                        <DropdownMenu.CheckboxItem
                          key="display-option-1"
                          value={settings.libraryOptions.display === "row"}
                          onValueChange={() =>
                            updateSettings({
                              libraryOptions: {
                                ...settings.libraryOptions,
                                display: "row",
                              },
                            })
                          }
                        >
                          <DropdownMenu.ItemIndicator />
                          <DropdownMenu.ItemTitle key="display-title-1">
                            {t("library.options.row")}
                          </DropdownMenu.ItemTitle>
                        </DropdownMenu.CheckboxItem>
                        <DropdownMenu.CheckboxItem
                          key="display-option-2"
                          value={settings.libraryOptions.display === "list"}
                          onValueChange={() =>
                            updateSettings({
                              libraryOptions: {
                                ...settings.libraryOptions,
                                display: "list",
                              },
                            })
                          }
                        >
                          <DropdownMenu.ItemIndicator />
                          <DropdownMenu.ItemTitle key="display-title-2">
                            {t("library.options.list")}
                          </DropdownMenu.ItemTitle>
                        </DropdownMenu.CheckboxItem>
                      </DropdownMenu.SubContent>
                    </DropdownMenu.Sub>
                    <DropdownMenu.Sub>
                      <DropdownMenu.SubTrigger key="image-style-trigger">
                        {t("library.options.image_style")}
                      </DropdownMenu.SubTrigger>
                      <DropdownMenu.SubContent
                        alignOffset={-10}
                        avoidCollisions={true}
                        collisionPadding={0}
                        loop={true}
                        sideOffset={10}
                      >
                        <DropdownMenu.CheckboxItem
                          key="poster-option"
                          value={
                            settings.libraryOptions.imageStyle === "poster"
                          }
                          onValueChange={() =>
                            updateSettings({
                              libraryOptions: {
                                ...settings.libraryOptions,
                                imageStyle: "poster",
                              },
                            })
                          }
                        >
                          <DropdownMenu.ItemIndicator />
                          <DropdownMenu.ItemTitle key="poster-title">
                            {t("library.options.poster")}
                          </DropdownMenu.ItemTitle>
                        </DropdownMenu.CheckboxItem>
                        <DropdownMenu.CheckboxItem
                          key="cover-option"
                          value={settings.libraryOptions.imageStyle === "cover"}
                          onValueChange={() =>
                            updateSettings({
                              libraryOptions: {
                                ...settings.libraryOptions,
                                imageStyle: "cover",
                              },
                            })
                          }
                        >
                          <DropdownMenu.ItemIndicator />
                          <DropdownMenu.ItemTitle key="cover-title">
                            {t("library.options.cover")}
                          </DropdownMenu.ItemTitle>
                        </DropdownMenu.CheckboxItem>
                      </DropdownMenu.SubContent>
                    </DropdownMenu.Sub>
                  </DropdownMenu.Group>
                  <DropdownMenu.Group key="show-titles-group">
                    <DropdownMenu.CheckboxItem
                      disabled={settings.libraryOptions.imageStyle === "poster"}
                      key="show-titles-option"
                      value={settings.libraryOptions.showTitles}
                      onValueChange={(newValue) => {
                        if (settings.libraryOptions.imageStyle === "poster")
                          return;
                        updateSettings({
                          libraryOptions: {
                            ...settings.libraryOptions,
                            showTitles: newValue === "on" ? true : false,
                          },
                        });
                      }}
                    >
                      <DropdownMenu.ItemIndicator />
                      <DropdownMenu.ItemTitle key="show-titles-title">
                        {t("library.options.show_titles")}
                      </DropdownMenu.ItemTitle>
                    </DropdownMenu.CheckboxItem>
                    <DropdownMenu.CheckboxItem
                      key="show-stats-option"
                      value={settings.libraryOptions.showStats}
                      onValueChange={(newValue) => {
                        updateSettings({
                          libraryOptions: {
                            ...settings.libraryOptions,
                            showStats: newValue === "on" ? true : false,
                          },
                        });
                      }}
                    >
                      <DropdownMenu.ItemIndicator />
                      <DropdownMenu.ItemTitle key="show-stats-title">
                        {t("library.options.show_stats")}
                      </DropdownMenu.ItemTitle>
                    </DropdownMenu.CheckboxItem>
                  </DropdownMenu.Group>

                  <DropdownMenu.Separator />
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            ),
        }}
      />
      <Stack.Screen
        name="[libraryId]"
        options={{
          title: "",
          headerShown: true,
          headerBlurEffect: "prominent",
          headerTransparent: Platform.OS === "ios" ? true : false,
          headerShadowVisible: false,
        }}
      />
      {Object.entries(nestedTabPageScreenOptions).map(([name, options]) => (
        <Stack.Screen key={name} name={name} options={options} />
      ))}
      <Stack.Screen
        name="collections/[collectionId]"
        options={{
          title: "",
          headerShown: true,
          headerBlurEffect: "prominent",
          headerTransparent: Platform.OS === "ios" ? true : false,
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}
