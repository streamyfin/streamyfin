import Ionicons from '@expo/vector-icons/Ionicons';
import { useAtom } from "jotai";
import { useCallback, useState, useEffect } from "react";
import { View } from "react-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getItemsApi, getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { RoundButton } from "../RoundButton";

interface Props {
  seriesId: string;
}

export const FavoriteButton: React.FC<Props> = ({ seriesId }) => {
  const [isFavorited, setIsFavorited] = useState(false);
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const checkIfFavorited = useCallback(async () => {
    if (api && user) {
      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        isFavorite: true,
        recursive: true,
      });
      if (!response.data.Items) return;
      const isFavorite = response.data.Items.some((x: any) => x.Id === seriesId);
      setIsFavorited(isFavorite);
    }
  }, [api, user, seriesId]);

  useEffect(() => {
    checkIfFavorited();
  }, [checkIfFavorited]);

  const markFavorite = useCallback(async () => {
    if (api && user) {
      await getUserLibraryApi(api).markFavoriteItem({
        userId: user.Id,
        itemId: seriesId,
      });
    }
  }, [api, user, seriesId]);

  const unmarkFavorite = useCallback(async () => {
    if (api && user) {
      await getUserLibraryApi(api).unmarkFavoriteItem({
        userId: user.Id,
        itemId: seriesId,
      });
    }
  }, [api, user, seriesId]);

  const onFavorite = useCallback(async () => {
    if (isFavorited) {
      setIsFavorited(false);
      await unmarkFavorite();
    } else {
      setIsFavorited(true);
      await markFavorite();
    }
  }, [isFavorited, markFavorite, unmarkFavorite]);

  return (
    <View>
      <RoundButton onPress={onFavorite}>
        <Ionicons name={isFavorited ? "heart-sharp" : "heart-outline"} size={22} color={isFavorited ? "purple" : "white"} />
      </RoundButton>
    </View>
  );
};
