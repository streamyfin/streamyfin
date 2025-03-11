import { Text } from "@/components/common/Text";
import { useTranslation } from "react-i18next";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation } from "expo-router";
import React from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import { MovieResult, TvResult } from "@/utils/jellyseerr/server/models/Search";
import { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import { TvDetails } from "@/utils/jellyseerr/server/models/Tv";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";

// TV-specific version of the Jellyseerr page
// This is a simplified version that doesn't use complex components that might not work on TV
const Page: React.FC = () => {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { t } = useTranslation();

  const { mediaTitle, releaseYear, posterSrc, mediaType } =
    params as unknown as {
      mediaTitle: string;
      releaseYear: number;
      canRequest: string;
      posterSrc: string;
      mediaType: MediaType;
    } & Partial<MovieResult | TvResult | MovieDetails | TvDetails>;

  const navigation = useNavigation();

  return (
    <View
      style={[
        styles.container,
        {
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{mediaTitle}</Text>
          <Text style={styles.year}>{releaseYear}</Text>
        </View>

        <View style={styles.posterContainer}>
          {posterSrc ? (
            <Image style={styles.poster} source={{ uri: posterSrc }} />
          ) : (
            <View style={styles.noPoster}>
              <Ionicons name="image-outline" size={48} color="white" />
            </View>
          )}
        </View>

        <View style={styles.messageContainer}>
          <Ionicons
            name="tv-outline"
            size={48}
            color={Colors.primary}
            style={styles.icon}
          />
          <Text style={styles.message}>
            {t("jellyseerr.not_available_on_tv")}
          </Text>
          <Text style={styles.subMessage}>
            {t("jellyseerr.use_mobile_device")}
          </Text>
        </View>
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
  },
  header: {
    alignItems: "center",
    marginBottom: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
  },
  year: {
    fontSize: 18,
    color: "#888",
    marginTop: 5,
  },
  posterContainer: {
    width: 240,
    height: 360,
    marginBottom: 40,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#333",
  },
  poster: {
    width: "100%",
    height: "100%",
  },
  noPoster: {
    width: "100%",
    height: "100%",
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
  },
  messageContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  icon: {
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

export default Page;
