import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { LinearGradient } from "expo-linear-gradient";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dimensions,
  FlatList,
  ImageBackground,
  TouchableOpacity,
  View,
} from "react-native";

export const RecentBanner = ({
  collection,
  onPressItem,
}: {
  collection: any;
  onPressItem: (item: any) => void;
}) => {
  const { width, height } = Dimensions.get("window");
  const bannerHeight = height * 0.5;
  const [items, setItems] = useState<BaseItemDto[]>([]);
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { t } = useTranslation();

  useEffect(() => {
    if (!api || !user?.Id || !collection) return;
    (async () => {
      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        limit: 10,
        recursive: true,
        includeItemTypes:
          collection.CollectionType === "tvshows"
            ? ["Episode", "Series"]
            : ["Movie"],
        sortBy: ["DateCreated"],
        sortOrder: ["Descending"],
        fields: ["PrimaryImageAspectRatio", "Path", "Genres"],
        parentId: collection.Id,
        enableImageTypes: ["Primary", "Backdrop", "Thumb", "Logo"],
      });
      let items = response.data.Items || [];
      if (collection.CollectionType === "tvshows") {
        const seriesIds = new Set(
          items.filter((i) => i.Type === "Series").map((i) => i.Id),
        );
        items = items.filter(
          (i) =>
            i.Type === "Series" ||
            (i.Type === "Episode" && !seriesIds.has(i.SeriesId!)),
        );
      }
      setItems(items.slice(0, 5));
    })();
  }, [api, user?.Id, collection]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList<BaseItemDto>>(null);

  if (!items.length) return null;

  return (
    <View style={{ height: bannerHeight }}>
      <FlatList
        ref={flatListRef}
        data={items}
        keyExtractor={(item, idx) => item.Id || String(idx)}
        horizontal
        showsHorizontalScrollIndicator={false}
        pagingEnabled
        style={{ width: "100%" }}
        onMomentumScrollEnd={(e) => {
          const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(newIndex);
        }}
        renderItem={({ item }) => {
          const imageUrl = getBackdropUrl({
            api,
            item,
            width: 1280,
            quality: 90,
          });
          const logoTag = item.ImageTags?.Logo;
          const logoUrl = logoTag
            ? `${api?.basePath}/Items/${item.Id}/Images/Logo?tag=${logoTag}&quality=90&fillHeight=80`
            : null;
          return (
            <TouchableOpacity
              onPress={() => onPressItem(item)}
              activeOpacity={0.9}
              style={{ width, height: bannerHeight }}
            >
              <ImageBackground
                source={imageUrl ? { uri: imageUrl } : undefined}
                style={{ flex: 1, justifyContent: "flex-end" }}
                resizeMode='cover'
              >
                <LinearGradient
                  colors={["transparent", "#000"]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 0.7 }}
                  style={{
                    width: "100%",
                    padding: 24,
                    minHeight: 80,
                    justifyContent: "flex-end",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 4,
                    }}
                  >
                    {logoUrl && (
                      <View style={{ marginBottom: 8 }}>
                        <ImageBackground
                          source={{ uri: logoUrl }}
                          style={{ width: 345, height: 58 }}
                          resizeMode='contain'
                        />
                      </View>
                    )}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: 4,
                      }}
                    >
                      <Text
                        style={{
                          color: "white",
                          fontWeight: "bold",
                          fontSize: 12,
                        }}
                      >
                        {item.Type === "Series"
                          ? t("home.banner.serie")
                          : t("home.banner.movie")}
                      </Text>
                      {item.Genres && item.Genres.length > 0 && (
                        <Text
                          style={{
                            color: "white",
                            fontWeight: "bold",
                            fontSize: 12,
                          }}
                        >
                          {" - "}
                          {item.Genres[0]}
                        </Text>
                      )}
                      {typeof item.CommunityRating === "number" && (
                        <Text
                          style={{
                            color: "#facc15",
                            fontWeight: "bold",
                            fontSize: 12,
                            marginLeft: 10,
                          }}
                        >
                          ★ {item.CommunityRating.toFixed(1)}
                        </Text>
                      )}
                    </View>
                  </View>
                  <Button color='purple' onPress={() => onPressItem(item)}>
                    {t("home.banner.more_infos")}
                  </Button>
                </LinearGradient>
              </ImageBackground>
            </TouchableOpacity>
          );
        }}
      />
      {/* Points d'indicateur de slide */}
      <View
        style={{
          position: "absolute",
          bottom: 4,
          left: 0,
          right: 0,
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {items.map((_, idx) => (
          <View
            key={idx}
            style={{
              width: currentIndex === idx ? 12 : 8,
              height: currentIndex === idx ? 12 : 8,
              borderRadius: 6,
              marginHorizontal: 4,
              backgroundColor:
                currentIndex === idx ? "white" : "rgba(255,255,255,0.4)",
              borderWidth: currentIndex === idx ? 1 : 0,
              borderColor: currentIndex === idx ? "#a855f7" : "transparent",
            }}
          />
        ))}
      </View>
    </View>
  );
};
