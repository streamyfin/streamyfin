import { getSystemApi } from "@jellyfin/sdk/lib/utils/api";
import * as Application from "expo-application";
import { useAtom } from "jotai";
import React from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

interface Props extends ViewProps {}

export const AdminMenu: React.FC<Props> = ({ ...props }) => {
  const [api] = useAtom(apiAtom);
  const [_user] = useAtom(userAtom);
  const { t } = useTranslation();

  const _version =
    Application?.nativeApplicationVersion ||
    Application?.nativeBuildVersion ||
    "N/A";

  const [serverInfo, setServerInfo] = React.useState<any>(null);
  // Get users count

  const getServerInfo = async () => {
    const systemApi = getSystemApi(api!);
    const serverInfo = await systemApi.getSystemInfo();
    //console.log(serverInfo);
    return serverInfo;
  };

  React.useEffect(() => {
    getServerInfo().then((info) => {
      console.log(`Server Version${info.data.ServerName}`);
      setServerInfo(info.data);
    });
  }, []);

  return (
    <>
      <View {...props}>
        <ListGroup title={t("home.admin.title")}>
          <ListItem
            title={t("home.admin.server_name")}
            value={serverInfo?.ServerName || "N/A"}
          />
          <ListItem
            title={t("home.settings.user_info.server")}
            value={api?.basePath}
          />

          <ListItem
            title={t("home.admin.server_version")}
            value={serverInfo?.Version || "N/A"}
          />
        </ListGroup>
      </View>

      <View {...props}>
        <ListGroup title={t("home.admin.running_tasks")}>
          <ListItem
            title={t("home.admin.server_name")}
            value={serverInfo?.ServerName || "N/A"}
          />
          <ListItem
            title={t("home.settings.user_info.server")}
            value={api?.basePath}
          />

          <ListItem
            title={t("home.admin.server_version")}
            value={serverInfo?.Version || "N/A"}
          />
        </ListGroup>
      </View>

      <View {...props}>
        <ListGroup title={t("home.admin.manage")}>
          <ListItem title={t("home.admin.manage_users")} showArrow />
          <ListItem title={t("home.admin.active_devices")} showArrow />
          <ListItem title={t("home.admin.active_sessions")} showArrow />
        </ListGroup>
      </View>
    </>
  );
};
