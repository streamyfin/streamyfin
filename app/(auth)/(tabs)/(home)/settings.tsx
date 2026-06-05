import { useNavigation } from "expo-router";
import { t } from "i18next";
import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { AppLanguageSelector } from "@/components/settings/AppLanguageSelector";
import { SettingsHero } from "@/components/settings/index/SettingsHero";
import { SettingsRow } from "@/components/settings/index/SettingsRow";
import { SettingsSearchBar } from "@/components/settings/index/SettingsSearchBar";
import { SettingsSection } from "@/components/settings/index/SettingsSection";
import {
  SETTINGS_CATALOG,
  type SettingsTarget,
} from "@/components/settings/index/settingsCatalog";
import { useSettingsSearch } from "@/components/settings/index/useSettingsSearch";
import {
  QuickConnectSheet,
  type QuickConnectSheetRef,
} from "@/components/settings/QuickConnect";
import { StorageSettings } from "@/components/settings/StorageSettings";
import useRouter from "@/hooks/useAppRouter";
import { useJellyfin } from "@/providers/JellyfinProvider";

const SettingsTV = Platform.isTV ? require("./settings.tv").default : null;

function SettingsMobile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout } = useJellyfin();
  const navigation = useNavigation();
  const quickConnectRef = useRef<QuickConnectSheetRef>(null);
  const [query, setQuery] = useState("");
  const os: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";
  const results = useSettingsSearch(query);
  const searching = query.trim().length > 0;

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

  const handleTarget = (target: SettingsTarget) => {
    if (target.type === "action") {
      if (target.action === "quickConnect") {
        quickConnectRef.current?.present();
      }
      return;
    }
    router.push(target.route as any);
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      keyboardShouldPersistTaps='handled'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingTop: 8,
        paddingBottom: 32,
      }}
    >
      {!searching && (
        <SettingsHero
          onPress={() => router.push("/settings/account/page" as any)}
        />
      )}
      <SettingsSearchBar value={query} onChange={setQuery} />

      {searching ? (
        <SettingsSection title={t("home.settings.search_results")}>
          {results.length === 0 ? (
            <View className='px-4 py-3'>
              <Text className='text-[#9899A1]'>
                {t("home.settings.search_no_results")}
              </Text>
            </View>
          ) : (
            results.map((r, i) => (
              <SettingsRow
                key={r.id}
                title={r.title}
                icon={r.icon}
                value={r.subtitle}
                onPress={() => handleTarget(r.target)}
                isLast={i === results.length - 1}
              />
            ))
          )}
        </SettingsSection>
      ) : (
        <>
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
                    onPress={() => handleTarget(e.target)}
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
        </>
      )}

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
