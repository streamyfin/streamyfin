import { getUserViewsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";

export default function AppearanceHideLibrariesPage() {
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
    // On logout the cached query refetches with api null and crashes inside
    // the SDK (`configuration` of null).
    enabled: !!api && !!user?.Id,
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
        className='px-4 pt-4'
      >
        <ListGroup title={t("home.settings.other.hide_libraries")}>
          {data?.map((view) => (
            <ListItem key={view.Id} title={view.Name} onPress={() => {}}>
              <SettingSwitch
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
          {t("home.settings.other.select_libraries_you_want_to_hide")}
        </Text>
      </DisabledSetting>
    </ScrollView>
  );
}
