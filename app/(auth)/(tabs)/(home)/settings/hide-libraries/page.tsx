import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { Loader } from "@/components/Loader";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getUserViewsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Switch, View } from "react-native";
import { useTranslation } from "react-i18next"; 
import DisabledSetting from "@/components/settings/DisabledSetting";

export default function page() {
  const [settings, updateSettings, pluginSettings] = useSettings();
  const user = useAtomValue(userAtom);
  const api = useAtomValue(apiAtom);

  const { t } = useTranslation();

  const { data, isLoading: isLoading } = useQuery({
    queryKey: ["user-views", user?.Id],
    queryFn: async () => {
      const response = await getUserViewsApi(api!).getUserViews({
        userId: user?.Id,
      });

      return response.data.Items || null;
    },
  });

  if (!settings) return null;

  if (isLoading)
    return (
      <View className="mt-4">
        <Loader />
      </View>
    );

  return (
    <DisabledSetting
      disabled={pluginSettings?.hiddenLibraries?.locked === true}
      className="px-4"
    >
      <ListGroup>
        {data?.map((view) => (
          <ListItem key={view.Id} title={view.Name} onPress={() => {}}>
            <Switch
              value={settings.hiddenLibraries?.includes(view.Id!) || false}
              onValueChange={(value) => {
                updateSettings({
                  hiddenLibraries: value
                    ? [...(settings.hiddenLibraries || []), view.Id!]
                    : settings.hiddenLibraries?.filter((id) => id !== view.Id),
                });
              }}
            />
          </ListItem>
        ))}
      </ListGroup>
      <Text className="px-4 text-xs text-neutral-500 mt-1">
      {t("home.settings.other.select_liraries_you_want_to_hide")}
      </Text>
    </DisabledSetting>
  );
}
