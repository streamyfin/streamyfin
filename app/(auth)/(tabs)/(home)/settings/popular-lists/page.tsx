import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { Loader } from "@/components/Loader";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { Linking, Switch } from "react-native";

export default function page() {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const [settings, updateSettings, pluginSettings] = useSettings();

  const handleOpenLink = () => {
    Linking.openURL(
      "https://github.com/lostb1t/jellyfin-plugin-collection-import"
    );
  };

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

  const disabled = useMemo(
    () =>
      pluginSettings?.usePopularPlugin?.locked === true &&
      pluginSettings?.mediaListCollectionIds?.locked === true,
    [pluginSettings]
  );

  if (!settings) return null;

  return (
    <DisabledSetting disabled={disabled} className="px-4 pt-4">
      <ListGroup title={"Enable plugin"} className="">
        <ListItem
          title={"Enable Popular Lists"}
          disabled={pluginSettings?.usePopularPlugin?.locked}
          onPress={() => {
            updateSettings({ usePopularPlugin: true });
            queryClient.invalidateQueries({ queryKey: ["search"] });
          }}
        >
          <Switch
            value={settings.usePopularPlugin}
            disabled={pluginSettings?.usePopularPlugin?.locked}
            onValueChange={(usePopularPlugin) =>
              updateSettings({ usePopularPlugin })
            }
          />
        </ListItem>
      </ListGroup>
      <Text className="px-4 text-xs text-neutral-500 mt-1">
        Popular Lists is a plugin that enables you to show custom Jellyfin lists
        on the Streamyfin home page.{" "}
        <Text className="text-blue-500" onPress={handleOpenLink}>
          Read more about Popular Lists.
        </Text>
      </Text>

      {settings.usePopularPlugin && (
        <>
          {!isLoadingMediaListCollections ? (
            <>
              {mediaListCollections?.length === 0 ? (
                <Text className="text-xs opacity-50 p-4">
                  No collections found. Add some in Jellyfin.
                </Text>
              ) : (
                <>
                  <ListGroup title="Media List Collections" className="mt-4">
                    {mediaListCollections?.map((mlc) => (
                      <ListItem
                        key={mlc.Id}
                        title={mlc.Name}
                        disabled={
                          pluginSettings?.mediaListCollectionIds?.locked
                        }
                      >
                        <Switch
                          disabled={
                            pluginSettings?.mediaListCollectionIds?.locked
                          }
                          value={settings.mediaListCollectionIds?.includes(
                            mlc.Id!
                          )}
                          onValueChange={(value) => {
                            if (!settings.mediaListCollectionIds) {
                              updateSettings({
                                mediaListCollectionIds: [mlc.Id!],
                              });
                              return;
                            }

                            updateSettings({
                              mediaListCollectionIds:
                                settings.mediaListCollectionIds.includes(
                                  mlc.Id!
                                )
                                  ? settings.mediaListCollectionIds.filter(
                                      (id) => id !== mlc.Id
                                    )
                                  : [
                                      ...settings.mediaListCollectionIds,
                                      mlc.Id!,
                                    ],
                            });
                          }}
                        />
                      </ListItem>
                    ))}
                  </ListGroup>
                  <Text className="px-4 text-xs text-neutral-500 mt-1">
                    Select the lists you want displayed on the home screen.
                  </Text>
                </>
              )}
            </>
          ) : (
            <Loader />
          )}
        </>
      )}
    </DisabledSetting>
  );
}
