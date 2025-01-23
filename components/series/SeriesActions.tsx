import { Ionicons } from "@expo/vector-icons";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { TouchableOpacity, View, ViewProps } from "react-native";

interface Props extends ViewProps {
  item: BaseItemDto;
}

export const ItemActions = ({ item, ...props }: Props) => {
  const router = useRouter();

  const trailerLink = useMemo(() => item.RemoteTrailers?.[0]?.Url, [item]);

  const openTrailer = useCallback(async () => {
    if (!trailerLink) return;

    const encodedTrailerLink = encodeURIComponent(trailerLink);
    router.push(`/trailer/page?url=${encodedTrailerLink}`);
  }, [router, trailerLink]);

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
