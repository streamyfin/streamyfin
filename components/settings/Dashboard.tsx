import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useSessions, type useSessionsProps } from "@/hooks/useSessions";
import { useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

export const Dashboard = () => {
  const [settings, _updateSettings] = useSettings(null);
  const { sessions = [] } = useSessions({} as useSessionsProps);
  const router = useRouter();

  const { t } = useTranslation();

  if (!settings) return null;
  return (
    <View>
      <ListGroup title={t("home.settings.dashboard.title")} className='mt-4'>
        <ListItem
          className={sessions.length !== 0 ? "bg-purple-900" : ""}
          onPress={() => router.push("/settings/dashboard/sessions")}
          title={t("home.settings.dashboard.sessions_title")}
          showArrow
        />
      </ListGroup>
    </View>
  );
};
