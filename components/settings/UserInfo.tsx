import * as Application from "expo-application";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

interface Props extends ViewProps {}

export const UserInfo: React.FC<Props> = ({ ...props }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { t } = useTranslation();

  // Show "0.54.1 (42)": the build number (CFBundleVersion / versionCode, auto-incremented
  // by EAS) uniquely identifies a build, so TestFlight/dev reports still pin the exact build.
  const appVersion = Application?.nativeApplicationVersion;
  const buildVersion = Application?.nativeBuildVersion;
  const version = appVersion
    ? `${appVersion}${buildVersion ? ` (${buildVersion})` : ""}`
    : buildVersion || "N/A";

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
