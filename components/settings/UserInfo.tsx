import { View, ViewProps } from "react-native";
import { Text } from "../common/Text";
import { ListItem } from "../list/ListItem";
import { Button } from "../Button";
import { apiAtom, useJellyfin, userAtom } from "@/providers/JellyfinProvider";
import { useAtom } from "jotai";
import Constants from "expo-constants";
import Application from "expo-application";
import { ListGroup } from "../list/ListGroup";
import { useTranslation } from "react-i18next";

interface Props extends ViewProps {}

export const UserInfo: React.FC<Props> = ({ ...props }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { t } = useTranslation();

  const version =
    Application?.nativeApplicationVersion ||
    Application?.nativeBuildVersion ||
    "N/A";

  return (
    <View {...props}>
      <ListGroup title={t("home.settings.user_info.user_info_title")}>
        <ListItem
          title={t("home.settings.user_info.user")}
          value={user?.Name}
        />
        <ListItem
          title={t("home.settings.user_info.server")}
          value={api?.basePath}
        />
        <ListItem
          title={t("home.settings.user_info.token")}
          value={api?.accessToken}
        />
        <ListItem
          title={t("home.settings.user_info.app_version")}
          value={version}
        />
      </ListGroup>
    </View>
  );
};
