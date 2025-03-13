import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Platform,
  Pressable,
  ScrollView,
} from "react-native";
import { Text } from "@/components/common/Text";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useNavigation } from "expo-router";
import { useJellyseerr, Endpoints } from "@/hooks/useJellyseerr";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const JellyseerrSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [focusedButton, setFocusedButton] = useState<string | null>(null);
  const { jellyseerrApi, jellyseerrUser, clearAllJellyseerData } =
    useJellyseerr();
  const insets = useSafeAreaInsets();

  const handleBackPress = () => {
    navigation.goBack();
  };

  const { data: settings, isLoading: isSettingsLoading } = useQuery({
    queryKey: ["jellyseerr", "settings"],
    queryFn: async () => {
      return jellyseerrApi?.axios
        .get(Endpoints.API_V1 + Endpoints.SETTINGS)
        .then(({ data }) => data);
    },
    enabled: !!jellyseerrApi,
  });

  // Common rendering for both platforms
  const renderSettingsContent = () => (
    <>
      <View style={styles.header}>
        <Text style={styles.title}>{t("jellyseerr.settings")}</Text>
      </View>

      {isSettingsLoading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t("library.options.loading")}</Text>
        </View>
      ) : (
        <>
          <View style={styles.settingsSection}>
            <Text style={styles.sectionTitle}>
              {t("jellyseerr.user_settings")}
            </Text>

            {jellyseerrUser && (
              <>
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>
                    {t("jellyseerr.username")}:
                  </Text>
                  <Text style={styles.settingValue}>
                    {jellyseerrUser.displayName}
                  </Text>
                </View>

                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>
                    {t("jellyseerr.email")}:
                  </Text>
                  <Text style={styles.settingValue}>
                    {jellyseerrUser.email}
                  </Text>
                </View>

                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>
                    {t("jellyseerr.user_type")}:
                  </Text>
                  <Text style={styles.settingValue}>
                    {jellyseerrUser.userType}
                  </Text>
                </View>
              </>
            )}
          </View>

          {jellyseerrUser?.requestCount !== undefined && (
            <View style={styles.settingsSection}>
              <Text style={styles.sectionTitle}>
                {t("jellyseerr.request_settings")}
              </Text>

              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>
                  {t("home.settings.plugins.jellyseerr.total_media_requests")}:
                </Text>
                <Text style={styles.settingValue}>
                  {jellyseerrUser.requestCount}
                </Text>
              </View>

              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>
                  {t("home.settings.plugins.jellyseerr.movie_quota_limit")}:
                </Text>
                <Text style={styles.settingValue}>
                  {jellyseerrUser.movieQuotaLimit === 0
                    ? t("home.settings.plugins.jellyseerr.unlimited")
                    : jellyseerrUser.movieQuotaLimit}
                </Text>
              </View>

              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>
                  {t("home.settings.plugins.jellyseerr.movie_quota_days")}:
                </Text>
                <Text style={styles.settingValue}>
                  {jellyseerrUser.movieQuotaDays === 0
                    ? t("home.settings.plugins.jellyseerr.unlimited")
                    : jellyseerrUser.movieQuotaDays}
                </Text>
              </View>

              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>
                  {t("home.settings.plugins.jellyseerr.tv_quota_limit")}:
                </Text>
                <Text style={styles.settingValue}>
                  {jellyseerrUser.tvQuotaLimit === 0
                    ? t("home.settings.plugins.jellyseerr.unlimited")
                    : jellyseerrUser.tvQuotaLimit}
                </Text>
              </View>

              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>
                  {t("home.settings.plugins.jellyseerr.tv_quota_days")}:
                </Text>
                <Text style={styles.settingValue}>
                  {jellyseerrUser.tvQuotaDays === 0
                    ? t("home.settings.plugins.jellyseerr.unlimited")
                    : jellyseerrUser.tvQuotaDays}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.settingsSection}>
            <Text style={styles.sectionTitle}>
              {t("jellyseerr.server_settings")}
            </Text>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>
                {t("jellyseerr.server_version")}:
              </Text>
              <Text style={styles.settingValue}>
                {settings?.version || "Unknown"}
              </Text>
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>
                {t("jellyseerr.server_url")}:
              </Text>
              <Text style={styles.settingValue}>
                {jellyseerrApi?.axios.defaults.baseURL}
              </Text>
            </View>
          </View>

          <View style={styles.buttonContainer}>
            <Pressable
              style={[
                styles.actionButton,
                styles.logoutButton,
                Platform.isTV &&
                  focusedButton === "logout" &&
                  styles.focusedButton,
              ]}
              onFocus={() => Platform.isTV && setFocusedButton("logout")}
              onBlur={() => Platform.isTV && setFocusedButton(null)}
              onPress={clearAllJellyseerData}
              hasTVPreferredFocus={Platform.isTV}
            >
              <Ionicons
                name="log-out-outline"
                size={24}
                color="white"
                style={styles.buttonIcon}
              />
              <Text style={styles.buttonText}>{t("jellyseerr.logout")}</Text>
            </Pressable>
          </View>
        </>
      )}
    </>
  );

  // TV-specific rendering
  if (Platform.isTV) {
    return (
      <View
        style={[
          styles.container,
          {
            paddingLeft: insets.left,
            paddingRight: insets.right,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <ScrollView contentContainerStyle={styles.tvScrollContent}>
          {renderSettingsContent()}

          <Pressable
            style={[
              styles.backButton,
              focusedButton === "back" && styles.focusedButton,
            ]}
            onFocus={() => setFocusedButton("back")}
            onBlur={() => setFocusedButton(null)}
            onPress={handleBackPress}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color="white"
              style={styles.backIcon}
            />
            <Text style={styles.buttonText}>{t("home.downloads.back")}</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // Mobile rendering
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {renderSettingsContent()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  scrollContent: {
    padding: 16,
  },
  tvScrollContent: {
    padding: 40,
    paddingBottom: 100, // Extra space for the back button
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "white",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 18,
    color: "white",
  },
  settingsSection: {
    marginBottom: 24,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: Platform.isTV ? 24 : 20,
    fontWeight: "bold",
    color: "white",
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  settingLabel: {
    fontSize: Platform.isTV ? 18 : 16,
    color: "#888",
    flex: 1,
  },
  settingValue: {
    fontSize: Platform.isTV ? 18 : 16,
    color: "white",
    flex: 1,
    textAlign: "right",
  },
  buttonContainer: {
    marginTop: 16,
    marginBottom: 40,
    alignItems: "center",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    minWidth: 200,
  },
  logoutButton: {
    backgroundColor: "#8B0000",
  },
  backButton: {
    position: Platform.isTV ? "absolute" : "relative",
    bottom: Platform.isTV ? 40 : undefined,
    left: Platform.isTV ? 40 : undefined,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#333",
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  focusedButton: {
    transform: [{ scale: 1.05 }],
    borderWidth: 2,
    borderColor: "white",
  },
  buttonIcon: {
    marginRight: 10,
  },
  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
});

export default JellyseerrSettingsPage;
