import { useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

interface Props extends ViewProps {}

export const AdminManage: React.FC<Props> = ({ ...props }) => {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View {...props}>
      <ListGroup title={t("home.admin.manage")}>
        <ListItem
          title={t("home.admin.running_tasks")}
          onPress={() => router.push("/(auth)/admin/tasks/page")}
          showArrow
        />
        <ListItem title={t("home.admin.manage_users")} showArrow />
        <ListItem title={t("home.admin.active_devices")} showArrow />
        <ListItem title={t("home.admin.active_sessions")} showArrow />
      </ListGroup>
    </View>
  );
};
