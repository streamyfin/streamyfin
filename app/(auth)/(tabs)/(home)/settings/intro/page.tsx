import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { storage } from "@/utils/mmkv";

export default function IntroPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View
        className='p-4 flex flex-col'
        style={{ paddingTop: Platform.OS === "android" ? 10 : 0 }}
      >
        <ListGroup title={t("home.settings.intro.title")}>
          <ListItem
            onPress={() => {
              router.push("/intro/page");
            }}
            title={t("home.settings.intro.show_intro")}
          />
          <ListItem
            textColor='red'
            onPress={() => {
              storage.set("hasShownIntro", false);
            }}
            title={t("home.settings.intro.reset_intro")}
          />
        </ListGroup>
        <View className='h-24' />
      </View>
    </ScrollView>
  );
}
