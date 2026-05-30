import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { LiveTVView } from "@/components/livetv/LiveTVView";

export default function LiveTV() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t("tabs.live_tv") }} />
      <LiveTVView />
    </>
  );
}
