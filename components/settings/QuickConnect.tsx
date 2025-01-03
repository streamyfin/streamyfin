import { Alert, View, ViewProps } from "react-native";
import { Text } from "../common/Text";
import { ListItem } from "../list/ListItem";
import { Button } from "../Button";
import { apiAtom, useJellyfin, userAtom } from "@/providers/JellyfinProvider";
import { useAtom } from "jotai";
import Constants from "expo-constants";
import Application from "expo-application";
import { ListGroup } from "../list/ListGroup";
import { getQuickConnectApi } from "@jellyfin/sdk/lib/utils/api";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";

interface Props extends ViewProps {}

export const QuickConnect: React.FC<Props> = ({ ...props }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { t } = useTranslation();

  const openQuickConnectAuthCodeInput = () => {
    Alert.prompt(
      t("home.settings.quick_connect.quick_connect_title"),
      t("home.settings.quick_connect.enter_the_quick_connect_code"),
      async (text) => {
        if (text) {
          try {
            const res = await getQuickConnectApi(api!).authorizeQuickConnect({
              code: text,
              userId: user?.Id,
            });
            if (res.status === 200) {
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success
              );
              Alert.alert(t("home.settings.quick_connect.success"), t("home.settings.quick_connect.quick_connect_autorized"));
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert(t("home.settings.quick_connect.error"), t("home.settings.quick_connect.invalid_code"));
            }
          } catch (e) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert(t("home.settings.quick_connect.error"), t("home.settings.quick_connect.invalid_code"));
          }
        }
      }
    );
  };

  return (
    <View {...props}>
      <ListGroup title={"Quick Connect"}>
        <ListItem
          onPress={openQuickConnectAuthCodeInput}
          title={t("home.settings.quick_connect.authorize_button")}
          textColor="blue"
        ></ListItem>
      </ListGroup>
    </View>
  );
};
