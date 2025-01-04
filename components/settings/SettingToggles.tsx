import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import React, { useState } from "react";
import {
  Linking,
  Switch,
  TouchableOpacity,
  View,
  ViewProps,
} from "react-native";
import * as DropdownMenu from "zeego/dropdown-menu";
import { Button } from "../Button";
import { Input } from "../common/Input";
import { Text } from "../common/Text";
import { Loader } from "../Loader";
import { AudioToggles } from "./AudioToggles";
import { JellyseerrSettings } from "./Jellyseerr";
import { MediaProvider } from "./MediaContext";
import { MediaToggles } from "./MediaToggles";
import { SubtitleToggles } from "./SubtitleToggles";

interface Props extends ViewProps {}

export const SettingToggles: React.FC<Props> = ({ ...props }) => {
  const [settings, updateSettings] = useSettings();

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [marlinUrl, setMarlinUrl] = useState<string>("");
  const queryClient = useQueryClient();

  const {
    data: mediaListCollections,
    isLoading: isLoadingMediaListCollections,
  } = useQuery({
    queryKey: ["sf_promoted", user?.Id, settings?.usePopularPlugin],
    queryFn: async () => {
      if (!api || !user?.Id) return [];

      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        tags: ["sf_promoted"],
        recursive: true,
        fields: ["Tags"],
        includeItemTypes: ["BoxSet"],
      });

      return response.data.Items ?? [];
    },
    enabled: !!api && !!user?.Id && settings?.usePopularPlugin === true,
    staleTime: 0,
  });

  if (!settings) return null;

  return (
    <View {...props}>
      {/* <View>
        <Text className="text-lg font-bold mb-2">Look and feel</Text>
        <View className="flex flex-col rounded-xl mb-4 overflow-hidden divide-y-2 divide-solid divide-neutral-800 opacity-50">
          <View className="flex flex-row items-center justify-between bg-neutral-900 p-4">
            <View className="shrink">
              <Text className="font-semibold">Coming soon</Text>
              <Text className="text-xs opacity-50 max-w-[90%]">
                Options for changing the look and feel of the app.
              </Text>
            </View>
            <Switch disabled />
          </View>
        </View>
      </View> */}

      <MediaProvider>
        <MediaToggles />
        <AudioToggles />
        <SubtitleToggles />
      </MediaProvider>

      <View>
        <Text className="text-lg font-bold mb-2">Other</Text>

        <View className="flex flex-col rounded-xl overflow-hidden  divide-y-2 divide-solid divide-neutral-800">
          <View className="flex flex-row items-center justify-between bg-neutral-900 p-4">
            <View className="shrink">
              <Text className="font-semibold">Auto rotate</Text>
              <Text className="text-xs opacity-50">
                Important on android since the video player orientation is
                locked to the app orientation.
              </Text>
            </View>
            <Switch
              value={settings.autoRotate}
              onValueChange={(value) => updateSettings({ autoRotate: value })}
            />
          </View>

          <View className="flex flex-row items-center justify-between bg-neutral-900 p-4">
            <View className="shrink">
              <Text className="font-semibold">Safe area in controls</Text>
              <Text className="text-xs opacity-50">
                Enable safe area in video player controls
              </Text>
            </View>
            <Switch
              value={settings.safeAreaInControlsEnabled}
              onValueChange={(value) =>
                updateSettings({ safeAreaInControlsEnabled: value })
              }
            />
          </View>

          <View className="flex flex-col">
            <View className="flex flex-row items-center justify-between bg-neutral-900 p-4">
              <View className="flex flex-col">
                <Text className="font-semibold">Use popular lists plugin</Text>
                <Text className="text-xs opacity-50">Made by: lostb1t</Text>
                <TouchableOpacity
                  onPress={() => {
                    Linking.openURL(
                      "https://github.com/lostb1t/jellyfin-plugin-media-lists"
                    );
                  }}
                >
                  <Text className="text-xs text-purple-600">More info</Text>
                </TouchableOpacity>
              </View>
              <Switch
                value={settings.usePopularPlugin}
                onValueChange={(value) =>
                  updateSettings({ usePopularPlugin: value })
                }
              />
            </View>
            {settings.usePopularPlugin && (
              <View className="flex flex-col py-2 bg-neutral-900">
                {mediaListCollections?.map((mlc) => (
                  <View
                    key={mlc.Id}
                    className="flex flex-row items-center justify-between bg-neutral-900 px-4 py-2"
                  >
                    <View className="flex flex-col">
                      <Text className="font-semibold">{mlc.Name}</Text>
                    </View>
                    <Switch
                      value={settings.mediaListCollectionIds?.includes(mlc.Id!)}
                      onValueChange={(value) => {
                        if (!settings.mediaListCollectionIds) {
                          updateSettings({
                            mediaListCollectionIds: [mlc.Id!],
                          });
                          return;
                        }

                        updateSettings({
                          mediaListCollectionIds:
                            settings.mediaListCollectionIds.includes(mlc.Id!)
                              ? settings.mediaListCollectionIds.filter(
                                  (id) => id !== mlc.Id
                                )
                              : [...settings.mediaListCollectionIds, mlc.Id!],
                        });
                      }}
                    />
                  </View>
                ))}
                {isLoadingMediaListCollections && (
                  <View className="flex flex-row items-center justify-center bg-neutral-900 p-4">
                    <Loader />
                  </View>
                )}
                {mediaListCollections?.length === 0 && (
                  <View className="flex flex-row items-center justify-between bg-neutral-900 p-4">
                    <Text className="text-xs opacity-50">
                      No collections found. Add some in Jellyfin.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          <View className="flex flex-col">
            <View
              className={`
                flex flex-row items-center space-x-2 justify-between bg-neutral-900 p-4
              `}
            >
              <View className="flex flex-col shrink">
                <Text className="font-semibold">Search engine</Text>
                <Text className="text-xs opacity-50">
                  Choose the search engine you want to use.
                </Text>
              </View>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  <TouchableOpacity className="bg-neutral-800 rounded-lg border-neutral-900 border px-3 py-2 flex flex-row items-center justify-between">
                    <Text>{settings.searchEngine}</Text>
                  </TouchableOpacity>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content
                  loop={true}
                  side="bottom"
                  align="start"
                  alignOffset={0}
                  avoidCollisions={true}
                  collisionPadding={8}
                  sideOffset={8}
                >
                  <DropdownMenu.Label>Profiles</DropdownMenu.Label>
                  <DropdownMenu.Item
                    key="1"
                    onSelect={() => {
                      updateSettings({ searchEngine: "Jellyfin" });
                      queryClient.invalidateQueries({ queryKey: ["search"] });
                    }}
                  >
                    <DropdownMenu.ItemTitle>Jellyfin</DropdownMenu.ItemTitle>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    key="2"
                    onSelect={() => {
                      updateSettings({ searchEngine: "Marlin" });
                      queryClient.invalidateQueries({ queryKey: ["search"] });
                    }}
                  >
                    <DropdownMenu.ItemTitle>Marlin</DropdownMenu.ItemTitle>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </View>
            {settings.searchEngine === "Marlin" && (
              <View className="flex flex-col bg-neutral-900 px-4 pb-4">
                <View className="flex flex-row items-center space-x-2">
                  <View className="grow">
                    <Input
                      placeholder="Marlin Server URL..."
                      defaultValue={settings.marlinServerUrl}
                      value={marlinUrl}
                      keyboardType="url"
                      returnKeyType="done"
                      autoCapitalize="none"
                      textContentType="URL"
                      onChangeText={(text) => setMarlinUrl(text)}
                    />
                  </View>
                  <Button
                    color="purple"
                    className="shrink w-16 h-12"
                    onPress={() => {
                      updateSettings({
                        marlinServerUrl: marlinUrl.endsWith("/")
                          ? marlinUrl
                          : marlinUrl + "/",
                      });
                    }}
                  >
                    Save
                  </Button>
                </View>

                {settings.marlinServerUrl && (
                  <Text className="text-neutral-500 mt-2">
                    Current: {settings.marlinServerUrl}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      </View>
      <JellyseerrSettings />
    </View>
  );
};
