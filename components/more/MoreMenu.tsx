import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { CustomLinksGroup } from "@/components/more/CustomLinksGroup";
import useRouter from "@/hooks/useAppRouter";
import { useDownload } from "@/providers/DownloadProvider";
import { userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";

/**
 * The More tab on a phone: what does not fit in the tab bar, as a grouped
 * list. Spec: components/more/MoreMenu.test.tsx.
 */
export const MoreMenu: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const user = useAtomValue(userAtom);
  const { downloadedItems } = useDownload();

  const showWatchlists =
    Boolean(settings?.streamyStatsServerUrl) && !settings?.hideWatchlistsTab;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View
        className='p-4 flex flex-col gap-y-4'
        style={{ paddingTop: Platform.OS === "android" ? 10 : 0 }}
      >
        <ListGroup title={t("more.your_media")}>
          <ListItem
            icon='heart'
            title={t("tabs.favorites")}
            showArrow
            onPress={() => router.push("/(auth)/(tabs)/(more)/favorites")}
          />
          {showWatchlists && (
            <ListItem
              icon='list'
              title={t("watchlists.title")}
              showArrow
              onPress={() => router.push("/(auth)/(tabs)/(more)/watchlists")}
            />
          )}
          <ListItem
            icon='download'
            title={t("home.downloads.downloads_title")}
            value={
              downloadedItems.length > 0
                ? String(downloadedItems.length)
                : undefined
            }
            showArrow
            onPress={() => router.push("/(auth)/(tabs)/(more)/downloads")}
          />
        </ListGroup>

        {settings?.showCustomMenuLinks && <CustomLinksGroup />}

        <ListGroup>
          {user?.Policy?.IsAdministrator && (
            <ListItem
              icon='play-circle'
              title={t("home.sessions.title")}
              showArrow
              onPress={() => router.push("/(auth)/(tabs)/(more)/sessions")}
            />
          )}
          <ListItem
            icon='settings'
            title={t("tabs.settings")}
            showArrow
            onPress={() => router.push("/(auth)/(tabs)/(more)/settings")}
          />
        </ListGroup>
      </View>
    </ScrollView>
  );
};
