import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Linking,
  TouchableOpacity,
  View,
  type ViewProps,
} from "react-native";
import type { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import type { TvDetails } from "@/utils/jellyseerr/server/models/Tv";

interface Props extends ViewProps {
  item: BaseItemDto | MovieDetails | TvDetails;
}

export const ItemActions = ({ item, ...props }: Props) => {
  const { t } = useTranslation();
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
      Alert.alert(t("common.no_trailer_available"));
      return;
    }

    try {
      await Linking.openURL(trailerLink);
    } catch (err) {
      console.error("Failed to open trailer link:", err);
    }
  }, [trailerLink, t]);

  return (
    <View className='' {...props}>
      {trailerLink && (
        <TouchableOpacity onPress={openTrailer}>
          <Ionicons name='film-outline' size={24} color='white' />
        </TouchableOpacity>
      )}
    </View>
  );
};
