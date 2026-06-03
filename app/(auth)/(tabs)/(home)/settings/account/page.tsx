import * as Application from "expo-application";
import { t } from "i18next";
import { useAtom } from "jotai";
import { useState } from "react";
import { Alert, ScrollView } from "react-native";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { useHaptic } from "@/hooks/useHaptic";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

export default function AccountPage() {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [revealed, setRevealed] = useState(false);
  const success = useHaptic("success");
  const version = Application.nativeApplicationVersion ?? "N/A";
  const token = api?.accessToken ?? "";
  const masked = token ? `•••• •••• •••• ${token.slice(-4)}` : "";

  const copyToken = async () => {
    if (!token) return;
    try {
      // Lazy import: expo-clipboard is a native module. Importing it at module
      // top crashes the screen on a dev client built before it was added; the
      // dynamic import defers loading until the user taps copy.
      const Clipboard = await import("expo-clipboard");
      await Clipboard.setStringAsync(token);
      success();
      Alert.alert(t("home.settings.account.copied"));
    } catch {
      Alert.alert(t("home.settings.account.copy_unavailable"));
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
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
          value={revealed ? token : masked}
          onPress={() => setRevealed((r) => !r)}
        />
        <ListItem
          title={t("home.settings.account.copy_token")}
          textColor='blue'
          onPress={copyToken}
        />
        <ListItem
          title={t("home.settings.user_info.app_version")}
          value={version}
        />
      </ListGroup>
    </ScrollView>
  );
}
