import { getUserViewsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { ScrollView, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";

export default function page() {
  const { settings, updateSettings, pluginSettings } = useSettings();
  const user = useAtomValue(userAtom);
  const api = useAtomValue(apiAtom);
  const insets = useSafeAreaInsets();

  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
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
      <View className='mt-4'>
        <Loader />
      </View>
    );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <DisabledSetting
        disabled={pluginSettings?.hiddenLibraries?.locked === true}
        className='px-4'
      >
        <ListGroup title={t("home.settings.other.hide_libraries")}>
          {data?.map((view) => (
            <ListItem key={view.Id} title={view.Name} onPress={() => {}}>
              <Switch
                value={settings.hiddenLibraries?.includes(view.Id!) || false}
                onValueChange={(value) => {
                  updateSettings({
                    hiddenLibraries: value
                      ? [...(settings.hiddenLibraries || []), view.Id!]
                      : settings.hiddenLibraries?.filter(
                          (id) => id !== view.Id,
                        ),
                  });
                }}
              />
            </ListItem>
          ))}
        </ListGroup>
        <Text className='px-4 text-xs text-neutral-500 mt-1'>
          {t("home.settings.other.select_liraries_you_want_to_hide")}
        </Text>
      </DisabledSetting>
    </ScrollView>
  );
}
