import { Stack, useLocalSearchParams } from "expo-router";
import TopTabs from "expo-router/js-top-tabs";
import { useTranslation } from "react-i18next";
import { MusicLibraryIdContext } from "@/components/music/MusicLibraryContext";

const TAB_LABEL_FONT_SIZE = 13;
const TAB_ITEM_HORIZONTAL_PADDING = 12;

// Opens on Suggestions. Expo Router 58 dropped initialRouteName; without an
// anchor the tabs open on the first route by name, Albums.
export const unstable_settings = { anchor: "suggestions" };

const Layout = () => {
  const { libraryId } = useLocalSearchParams<{ libraryId: string }>();
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen
        options={{
          title: t("music.title"),
          headerStyle: { backgroundColor: "black" },
          headerShadowVisible: false,
        }}
      />
      <MusicLibraryIdContext value={libraryId}>
        <TopTabs
          keyboardDismissMode='none'
          screenOptions={{
            tabBarBounces: true,
            tabBarActiveTintColor: "#FFFFFF",
            tabBarInactiveTintColor: "#9CA3AF",
            tabBarLabelStyle: {
              fontSize: TAB_LABEL_FONT_SIZE,
              fontWeight: "600",
              flexWrap: "nowrap",
            },
            tabBarItemStyle: {
              width: "auto",
              paddingHorizontal: TAB_ITEM_HORIZONTAL_PADDING,
            },
            tabBarStyle: { backgroundColor: "black" },
            animationEnabled: true,
            lazy: true,
            swipeEnabled: true,
            tabBarIndicatorStyle: { backgroundColor: "#9334E9" },
            tabBarScrollEnabled: true,
          }}
        >
          <TopTabs.Screen
            name='suggestions'
            options={{ title: t("music.tabs.suggestions") }}
          />
          <TopTabs.Screen
            name='albums'
            options={{ title: t("music.tabs.albums") }}
          />
          <TopTabs.Screen
            name='artists'
            options={{ title: t("music.tabs.artists") }}
          />
          <TopTabs.Screen
            name='playlists'
            options={{ title: t("music.tabs.playlists") }}
          />
        </TopTabs>
      </MusicLibraryIdContext>
    </>
  );
};

export default Layout;
