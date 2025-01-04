import { Text } from "@/components/common/Text";
import { nestedTabPageScreenOptions } from "@/components/stacks/NestedTabPageStack";
import { useSettings } from "@/utils/atoms/settings";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useState } from "react";
import { Modal, Platform, TouchableOpacity, View } from "react-native";

export default function IndexLayout() {
  const [settings, updateSettings] = useSettings();
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);

  const MenuItem = ({
    label,
    selected,
    onPress,
    disabled = false,
  }: {
    label: string;
    selected?: boolean;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <TouchableOpacity
      className={`p-4 border-b border-neutral-800 flex-row items-center justify-between ${
        disabled ? "opacity-50" : ""
      }`}
      onPress={onPress}
      disabled={disabled}
    >
      <Text className="text-base">{label}</Text>
      {selected && <Ionicons name="checkmark" size={24} color="white" />}
    </TouchableOpacity>
  );

  const MenuSection = ({ title }: { title: string }) => (
    <View className="p-4 border-b border-neutral-800 bg-neutral-800/30">
      <Text className="text-sm opacity-50 font-medium">{title}</Text>
    </View>
  );

  if (!settings?.libraryOptions) return null;

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          headerLargeTitle: true,
          headerTitle: "Library",
          headerBlurEffect: "prominent",
          headerTransparent: Platform.OS === "ios" ? true : false,
          headerShadowVisible: false,
          headerRight: () => (
            <Modal
              visible={isMenuVisible}
              transparent
              animationType="slide"
              onRequestClose={() => {
                setIsMenuVisible(false);
                setActiveSubmenu(null);
              }}
            >
              <TouchableOpacity
                className="flex-1 bg-black/50"
                activeOpacity={1}
                onPress={() => {
                  setIsMenuVisible(false);
                  setActiveSubmenu(null);
                }}
              >
                <View className="mt-auto bg-neutral-900 rounded-t-xl">
                  {!activeSubmenu ? (
                    <>
                      <MenuSection title="Display" />
                      <MenuItem
                        label="Display"
                        onPress={() => setActiveSubmenu("display")}
                      />
                      <MenuItem
                        label="Image style"
                        onPress={() => setActiveSubmenu("imageStyle")}
                      />
                      <MenuItem
                        label="Show titles"
                        selected={settings.libraryOptions.showTitles}
                        disabled={
                          settings.libraryOptions.imageStyle === "poster"
                        }
                        onPress={() => {
                          if (settings.libraryOptions.imageStyle === "poster")
                            return;
                          updateSettings({
                            libraryOptions: {
                              ...settings.libraryOptions,
                              showTitles: !settings.libraryOptions.showTitles,
                            },
                          });
                        }}
                      />
                      <MenuItem
                        label="Show stats"
                        selected={settings.libraryOptions.showStats}
                        onPress={() => {
                          updateSettings({
                            libraryOptions: {
                              ...settings.libraryOptions,
                              showStats: !settings.libraryOptions.showStats,
                            },
                          });
                        }}
                      />
                    </>
                  ) : activeSubmenu === "display" ? (
                    <>
                      <View className="p-4 border-b border-neutral-800 flex-row items-center">
                        <TouchableOpacity
                          onPress={() => setActiveSubmenu(null)}
                        >
                          <Ionicons
                            name="chevron-back"
                            size={24}
                            color="white"
                          />
                        </TouchableOpacity>
                        <Text className="text-lg font-bold ml-2">Display</Text>
                      </View>
                      <MenuItem
                        label="Row"
                        selected={settings.libraryOptions.display === "row"}
                        onPress={() => {
                          updateSettings({
                            libraryOptions: {
                              ...settings.libraryOptions,
                              display: "row",
                            },
                          });
                          setActiveSubmenu(null);
                        }}
                      />
                      <MenuItem
                        label="List"
                        selected={settings.libraryOptions.display === "list"}
                        onPress={() => {
                          updateSettings({
                            libraryOptions: {
                              ...settings.libraryOptions,
                              display: "list",
                            },
                          });
                          setActiveSubmenu(null);
                        }}
                      />
                    </>
                  ) : activeSubmenu === "imageStyle" ? (
                    <>
                      <View className="p-4 border-b border-neutral-800 flex-row items-center">
                        <TouchableOpacity
                          onPress={() => setActiveSubmenu(null)}
                        >
                          <Ionicons
                            name="chevron-back"
                            size={24}
                            color="white"
                          />
                        </TouchableOpacity>
                        <Text className="text-lg font-bold ml-2">
                          Image Style
                        </Text>
                      </View>
                      <MenuItem
                        label="Poster"
                        selected={
                          settings.libraryOptions.imageStyle === "poster"
                        }
                        onPress={() => {
                          updateSettings({
                            libraryOptions: {
                              ...settings.libraryOptions,
                              imageStyle: "poster",
                            },
                          });
                          setActiveSubmenu(null);
                        }}
                      />
                      <MenuItem
                        label="Cover"
                        selected={
                          settings.libraryOptions.imageStyle === "cover"
                        }
                        onPress={() => {
                          updateSettings({
                            libraryOptions: {
                              ...settings.libraryOptions,
                              imageStyle: "cover",
                            },
                          });
                          setActiveSubmenu(null);
                        }}
                      />
                    </>
                  ) : null}

                  <TouchableOpacity
                    className="p-4 border-t border-neutral-800"
                    onPress={() => {
                      setIsMenuVisible(false);
                      setActiveSubmenu(null);
                    }}
                  >
                    <Text className="text-center text-purple-400">Done</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Modal>
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
