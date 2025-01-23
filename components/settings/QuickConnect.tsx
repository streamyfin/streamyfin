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

interface Props extends ViewProps {}

export const QuickConnect: React.FC<Props> = ({ ...props }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const openQuickConnectAuthCodeInput = () => {
    Alert.prompt(
      "Quick connect",
      "Enter the quick connect code",
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
              Alert.alert("Success", "Quick connect authorized");
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert("Error", "Invalid code");
            }
          } catch (e) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert("Error", "Invalid code");
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
          title="Authorize Quick Connect"
          textColor="blue"
        ></ListItem>
      </ListGroup>
    </View>
  );
};
