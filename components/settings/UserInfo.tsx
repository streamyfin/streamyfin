import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getVersionInfo } from "@/utils/version";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

interface Props extends ViewProps {}

export const UserInfo: React.FC<Props> = ({ ...props }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { t } = useTranslation();

  // Graduated build identifier — see utils/version.ts:
  // dev → "0.54.1 · branch · commit", develop/CI → "0.54.1 · commit", production → "0.54.1 (42)".
  const { display: version } = getVersionInfo();

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
