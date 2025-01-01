import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { View, Text, FlatList } from "react-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";

export default function Favorites() {
  const [favorites, setFavorites] = useState([]);
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  useEffect(() => {
    const fetchFavorites = async () => {
      if (api && user) {
        const response = await getItemsApi(api).getItems({
          userId: user.Id,
          isFavorite: true,
        });
        if (response.data.Items) {
          setFavorites(response.data.Items);
        }
      }
    };

    fetchFavorites();
  }, [api, user]);

  return (
    <View>
    </View>
  );
}
