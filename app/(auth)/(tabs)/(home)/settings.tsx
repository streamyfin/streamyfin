import { useNavigation } from "expo-router";
import { t } from "i18next";
import { useEffect, useRef } from "react";
import { Platform, ScrollView, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { AppLanguageSelector } from "@/components/settings/AppLanguageSelector";
import { SettingsRow } from "@/components/settings/index/SettingsRow";
import { SettingsSection } from "@/components/settings/index/SettingsSection";
import {
  SETTINGS_CATALOG,
  type SettingsEntry,
} from "@/components/settings/index/settingsCatalog";
import {
  QuickConnectSheet,
  type QuickConnectSheetRef,
} from "@/components/settings/QuickConnect";
import { StorageSettings } from "@/components/settings/StorageSettings";
import useRouter from "@/hooks/useAppRouter";
import { useJellyfin } from "@/providers/JellyfinProvider";

// TV-specific settings component
const SettingsTV = Platform.isTV ? require("./settings.tv").default : null;

function SettingsMobile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout } = useJellyfin();
  const navigation = useNavigation();
  const quickConnectRef = useRef<QuickConnectSheetRef>(null);
  const os: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => logout()}>
          <Text className='text-red-600 px-2'>
            {t("home.settings.log_out_button")}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, []);

  const handleEntry = (entry: SettingsEntry) => {
    if (entry.target.type === "action") {
      if (entry.target.action === "quickConnect") {
        quickConnectRef.current?.present();
      }
      return;
    }
    router.push(entry.target.route as any);
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingTop: 8,
        paddingBottom: 32,
      }}
    >
      <View className='mx-3 mb-5'>
        <AppLanguageSelector />
      </View>

      {SETTINGS_CATALOG.map((section) => {
        const entries = section.entries.filter(
          (e) => !e.platforms || e.platforms.includes(os),
        );
        if (entries.length === 0) return null;
        return (
          <SettingsSection key={section.id} title={t(section.titleKey)}>
            {entries.map((e, i) => (
              <SettingsRow
                key={e.id}
                title={t(e.titleKey)}
                icon={e.icon}
                onPress={() => handleEntry(e)}
                isLast={i === entries.length - 1}
              />
            ))}
          </SettingsSection>
        );
      })}

      <SettingsSection>
        <View className='p-3'>
          <StorageSettings />
        </View>
      </SettingsSection>

      <QuickConnectSheet ref={quickConnectRef} />
    </ScrollView>
  );
}

export default function settings() {
  if (Platform.isTV && SettingsTV) {
    return <SettingsTV />;
  }
  return <SettingsMobile />;
}
