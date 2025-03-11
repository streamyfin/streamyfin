import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from "react-native";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/utils/atoms/settings";
import { Colors } from "@/constants/Colors";
import { useJellyfin } from "@/providers/JellyfinProvider";
import { router } from "expo-router";

export default function TVSettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useSettings();
  const { logout } = useJellyfin();
  const [focusedSetting, setFocusedSetting] = useState<string | null>(null);

  const handleLogout = useCallback(async () => {
    await logout();
    router.replace("/login");
  }, [logout]);

  const updateSetting = useCallback((key: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, [setSettings]);

  const renderSettingItem = (
    key: string,
    title: string,
    description: string,
    component: React.ReactNode
  ) => {
    return (
      <Pressable
        style={[
          styles.settingItem,
          focusedSetting === key && styles.focusedSettingItem
        ]}
        onFocus={() => setFocusedSetting(key)}
        onBlur={() => setFocusedSetting(null)}
      >
        <View style={styles.settingTextContainer}>
          <Text style={styles.settingTitle}>{title}</Text>
          <Text style={styles.settingDescription}>{description}</Text>
        </View>
        <View style={styles.settingControl}>
          {component}
        </View>
      </Pressable>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.pageTitle}>{t("tabs.settings")}</Text>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.playback")}</Text>
        
        {renderSettingItem(
          "autoPlay",
          t("settings.auto_play"),
          t("settings.auto_play_description"),
          <Switch
            value={settings.autoPlay}
            onValueChange={(value) => updateSetting("autoPlay", value)}
            trackColor={{ false: "#333", true: Colors.primary }}
          />
        )}
        
        {renderSettingItem(
          "autoPlayNextEpisode",
          t("settings.auto_play_next_episode"),
          t("settings.auto_play_next_episode_description"),
          <Switch
            value={settings.autoPlayNextEpisode}
            onValueChange={(value) => updateSetting("autoPlayNextEpisode", value)}
            trackColor={{ false: "#333", true: Colors.primary }}
          />
        )}
      </View>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.appearance")}</Text>
        
        {renderSettingItem(
          "showCustomMenuLinks",
          t("settings.show_custom_menu_links"),
          t("settings.show_custom_menu_links_description"),
          <Switch
            value={settings.showCustomMenuLinks}
            onValueChange={(value) => updateSetting("showCustomMenuLinks", value)}
            trackColor={{ false: "#333", true: Colors.primary }}
          />
        )}
      </View>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.account")}</Text>
        
        <Pressable
          style={[
            styles.settingItem,
            styles.logoutButton,
            focusedSetting === "logout" && styles.focusedLogoutButton
          ]}
          onFocus={() => setFocusedSetting("logout")}
          onBlur={() => setFocusedSetting(null)}
          onPress={handleLogout}
        >
          <Text style={styles.logoutText}>{t("logout")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  contentContainer: {
    padding: 40,
  },
  pageTitle: {
    color: "white",
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 30,
  },
  section: {
    marginBottom: 40,
  },
  sectionTitle: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    paddingBottom: 10,
  },
  settingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 15,
    marginBottom: 10,
    borderRadius: 8,
  },
  focusedSettingItem: {
    backgroundColor: "#333",
  },
  settingTextContainer: {
    flex: 1,
    marginRight: 20,
  },
  settingTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 5,
  },
  settingDescription: {
    color: "#aaa",
    fontSize: 16,
  },
  settingControl: {
    minWidth: 60,
    alignItems: "flex-end",
  },
  logoutButton: {
    backgroundColor: "#8B0000",
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    width: 200,
  },
  focusedLogoutButton: {
    backgroundColor: "#B22222",
    transform: [{ scale: 1.05 }],
  },
  logoutText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
});