import { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import { TvDetails } from "@/utils/jellyseerr/server/models/Tv";
import { Ionicons } from "@expo/vector-icons";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useCallback, useMemo } from "react";
import {
  Alert,
  Linking,
  TouchableOpacity,
  View,
  ViewProps,
} from "react-native";

interface Props extends ViewProps {
  item: BaseItemDto | MovieDetails | TvDetails;
}

export const ItemActions = ({ item, ...props }: Props) => {
  const trailerLink = useMemo(() => {
    if ("RemoteTrailers" in item && item.RemoteTrailers?.[0]?.Url) {
      return item.RemoteTrailers[0].Url;
    }

    if ("relatedVideos" in item) {
      return item.relatedVideos?.find((v) => v.type === "Trailer")?.url;
    }

    return undefined;
  }, [item]);

  const openTrailer = useCallback(async () => {
    if (!trailerLink) {
      Alert.alert("No trailer available");
      return;
    }

    try {
      await Linking.openURL(trailerLink);
    } catch (err) {
      console.error("Failed to open trailer link:", err);
    }
  }, [trailerLink]);

  return (
    <View className="" {...props}>
      {trailerLink && (
        <TouchableOpacity onPress={openTrailer}>
          <Ionicons name="film-outline" size={24} color="white" />
        </TouchableOpacity>
      )}
    </View>
  );
};
