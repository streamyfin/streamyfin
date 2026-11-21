import { Stack, useLocalSearchParams } from "expo-router";
import TopTabs from "expo-router/js-top-tabs";
import { useTranslation } from "react-i18next";
import { AudiobookLibraryIdContext } from "@/components/audiobooks/AudiobookLibraryContext";

const TAB_LABEL_FONT_SIZE = 13;
const TAB_ITEM_HORIZONTAL_PADDING = 12;

// Opens on Listen now. Expo Router 58 dropped initialRouteName; without an
// anchor the tabs open on the first route by name.
export const unstable_settings = { anchor: "listen" };

const Layout = () => {
  const { libraryId } = useLocalSearchParams<{ libraryId: string }>();
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen
        options={{
          title: t("audiobooks.title"),
          headerStyle: { backgroundColor: "black" },
          headerShadowVisible: false,
        }}
      />
      <AudiobookLibraryIdContext value={libraryId}>
        <TopTabs
          keyboardDismissMode='on-drag'
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
            name='listen'
            options={{ title: t("audiobooks.tabs.listen_now") }}
          />
          <TopTabs.Screen
            name='books'
            options={{ title: t("audiobooks.tabs.books") }}
          />
          <TopTabs.Screen
            name='authors'
            options={{ title: t("audiobooks.tabs.authors") }}
          />
        </TopTabs>
      </AudiobookLibraryIdContext>
    </>
  );
};

export default Layout;
