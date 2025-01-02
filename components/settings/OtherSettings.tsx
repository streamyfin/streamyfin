import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { ScreenOrientationEnum, useSettings } from "@/utils/atoms/settings";
import {
  BACKGROUND_FETCH_TASK,
  registerBackgroundFetchAsync,
  unregisterBackgroundFetchAsync,
} from "@/utils/background-tasks";
import { Ionicons } from "@expo/vector-icons";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as BackgroundFetch from "expo-background-fetch";
import * as ScreenOrientation from "expo-screen-orientation";
import * as TaskManager from "expo-task-manager";
import { useAtom } from "jotai";
import React, { useEffect, useState } from "react";
import { Linking, Switch, TouchableOpacity, ViewProps } from "react-native";
import { toast } from "sonner-native";
import * as DropdownMenu from "zeego/dropdown-menu";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { Loader } from "../Loader";

interface Props extends ViewProps {}

export const OtherSettings: React.FC = () => {
  const [settings, updateSettings] = useSettings();

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const [marlinUrl, setMarlinUrl] = useState<string>("");

  /********************
   * Background task
   *******************/
  const checkStatusAsync = async () => {
    await BackgroundFetch.getStatusAsync();
    return await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
  };

  useEffect(() => {
    (async () => {
      const registered = await checkStatusAsync();

      if (settings?.autoDownload === true && !registered) {
        registerBackgroundFetchAsync();
        toast.success("Background downloads enabled");
      } else if (settings?.autoDownload === false && registered) {
        unregisterBackgroundFetchAsync();
        toast.info("Background downloads disabled");
      } else if (settings?.autoDownload === true && registered) {
        // Don't to anything
      } else if (settings?.autoDownload === false && !registered) {
        // Don't to anything
      } else {
        updateSettings({ autoDownload: false });
      }
    })();
  }, [settings?.autoDownload]);
  /**********************
   *********************/

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
    <ListGroup title="Other" className="mb-4">
      <ListItem title="Auto rotate">
        <Switch
          value={settings.autoRotate}
          onValueChange={(value) => updateSettings({ autoRotate: value })}
        />
      </ListItem>

      <ListItem title="Video orientation" disabled={settings.autoRotate}>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <TouchableOpacity className="flex flex-row items-center justify-between py-3 pl-3">
              <Text className="mr-1 text-[#8E8D91]">
                {ScreenOrientationEnum[settings.defaultVideoOrientation]}
              </Text>
              <Ionicons name="chevron-expand-sharp" size={18} color="#5A5960" />
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
            <DropdownMenu.Label>Orientation</DropdownMenu.Label>
            <DropdownMenu.Item
              key="1"
              onSelect={() => {
                updateSettings({
                  defaultVideoOrientation:
                    ScreenOrientation.OrientationLock.DEFAULT,
                });
              }}
            >
              <DropdownMenu.ItemTitle>
                {
                  ScreenOrientationEnum[
                    ScreenOrientation.OrientationLock.DEFAULT
                  ]
                }
              </DropdownMenu.ItemTitle>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              key="2"
              onSelect={() => {
                updateSettings({
                  defaultVideoOrientation:
                    ScreenOrientation.OrientationLock.PORTRAIT_UP,
                });
              }}
            >
              <DropdownMenu.ItemTitle>
                {
                  ScreenOrientationEnum[
                    ScreenOrientation.OrientationLock.PORTRAIT_UP
                  ]
                }
              </DropdownMenu.ItemTitle>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              key="3"
              onSelect={() => {
                updateSettings({
                  defaultVideoOrientation:
                    ScreenOrientation.OrientationLock.LANDSCAPE_LEFT,
                });
              }}
            >
              <DropdownMenu.ItemTitle>
                {
                  ScreenOrientationEnum[
                    ScreenOrientation.OrientationLock.LANDSCAPE_LEFT
                  ]
                }
              </DropdownMenu.ItemTitle>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              key="4"
              onSelect={() => {
                updateSettings({
                  defaultVideoOrientation:
                    ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT,
                });
              }}
            >
              <DropdownMenu.ItemTitle>
                {
                  ScreenOrientationEnum[
                    ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT
                  ]
                }
              </DropdownMenu.ItemTitle>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </ListItem>

      <ListItem title="Safe area in controls">
        <Switch
          value={settings.safeAreaInControlsEnabled}
          onValueChange={(value) =>
            updateSettings({ safeAreaInControlsEnabled: value })
          }
        />
      </ListItem>

      <ListItem
        title="Use popular lists plugin"
        onPress={() =>
          Linking.openURL(
            "https://github.com/lostb1t/jellyfin-plugin-media-lists"
          )
        }
      >
        <Switch
          value={settings.usePopularPlugin}
          onValueChange={(value) => updateSettings({ usePopularPlugin: value })}
        />
      </ListItem>

      {settings.usePopularPlugin && (
        <ListGroup title="Media List Collections">
          {mediaListCollections?.map((mlc) => (
            <ListItem key={mlc.Id} title={mlc.Name}>
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
            </ListItem>
          ))}
          {isLoadingMediaListCollections && <Loader />}
          {mediaListCollections?.length === 0 && (
            <Text className="text-xs opacity-50 p-4">
              No collections found. Add some in Jellyfin.
            </Text>
          )}
        </ListGroup>
      )}
      <ListItem
        title="Show Custom Menu Links"
        onPress={() =>
          Linking.openURL(
            "https://jellyfin.org/docs/general/clients/web-config/#custom-menu-links"
          )
        }
      >
        <Switch
          value={settings.showCustomMenuLinks}
          onValueChange={(value) =>
            updateSettings({ showCustomMenuLinks: value })
          }
        />
      </ListItem>
    </ListGroup>
  );
};
