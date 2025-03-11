import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "@/components/common/Text";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";

// TV-specific version of the Jellyseerr genre page
const GenrePage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Ionicons
          name="film-outline"
          size={64}
          color={Colors.primary}
          style={styles.icon}
        />
        <Text style={styles.title}>{t("jellyseerr.genre_details")}</Text>
        <Text style={styles.message}>
          {t("jellyseerr.not_available_on_tv")}
        </Text>
        <Text style={styles.subMessage}>
          {t("jellyseerr.use_mobile_device")}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  content: {
    flex: 1,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
    marginBottom: 20,
  },
  message: {
    fontSize: 24,
    color: "white",
    textAlign: "center",
    marginBottom: 10,
  },
  subMessage: {
    fontSize: 18,
    color: "#888",
    textAlign: "center",
  },
});

export default GenrePage;
