import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { LiveTVView } from "@/components/livetv/LiveTVView";
import { TVLiveTVPage } from "@/components/livetv/TVLiveTVPage";

export default function LiveTV() {
  const { t } = useTranslation();

  if (Platform.isTV) {
    return <TVLiveTVPage />;
  }

  return (
    <>
      <Stack.Screen options={{ title: t("live_tv.title") }} />
      <LiveTVView />
    </>
  );
}
