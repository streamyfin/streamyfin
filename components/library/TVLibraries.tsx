import { Ionicons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  CollectionType,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi, getUserViewsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useAtom } from "jotai";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Easing, FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ServerImage } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";

const HORIZONTAL_PADDING = 80;
const CARD_HEIGHT = 220;
const CARD_GAP = 24;
const SCALE_PADDING = 20;

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const icons: Record<CollectionType, IconName> = {
  movies: "film",
  tvshows: "tv",
  music: "musical-notes",
  books: "book",
  homevideos: "videocam",
  boxsets: "albums",
  playlists: "list",
  folders: "folder",
  livetv: "tv",
  musicvideos: "musical-notes",
  photos: "images",
  trailers: "videocam",
  unknown: "help-circle",
} as const;

interface LibraryWithPreview extends BaseItemDto {
  previewItems?: BaseItemDto[];
  itemCount?: number;
}

const TVLibraryRow: React.FC<{
  library: LibraryWithPreview;
  isFirst: boolean;
  onPress: () => void;
}> = ({ library, isFirst, onPress }) => {
  const [api] = useAtom(apiAtom);
  const { t } = useTranslation();
  const typography = useScaledTVTypography();
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.7)).current;

  const animateTo = (toScale: number, toOpacity: number) => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: toScale,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: toOpacity,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const backdropUrl = useMemo(() => {
    // Try to get backdrop from library or first preview item
    if (library.previewItems?.[0]) {
      return getBackdropUrl({
        api,
        item: library.previewItems[0],
        width: 1920,
      });
    }
    return getBackdropUrl({
      api,
      item: library,
      width: 1920,
    });
  }, [api, library]);

  const iconName = icons[library.CollectionType!] || "folder";

  const itemTypeName = useMemo(() => {
    if (library.CollectionType === "movies")
      return t("library.item_types.movies");
    if (library.CollectionType === "tvshows")
      return t("library.item_types.series");
    if (library.CollectionType === "boxsets")
      return t("library.item_types.boxsets");
    if (library.CollectionType === "playlists")
      return t("library.item_types.playlists");
    if (library.CollectionType === "music")
      return t("library.item_types.items");
    return t("library.item_types.items");
  }, [library.CollectionType, t]);

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animateTo(1.02, 1);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1, 0.7);
      }}
      hasTVPreferredFocus={isFirst}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          opacity,
          height: CARD_HEIGHT,
          borderRadius: 20,
          overflow: "hidden",
          backgroundColor: "#1a1a1a",
          borderWidth: focused ? 4 : 0,
          borderColor: "#FFFFFF",
          shadowColor: "#FFFFFF",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: focused ? 0.3 : 0,
          shadowRadius: focused ? 30 : 0,
        }}
      >
        {/* Background Image */}
        {backdropUrl && (
          <ServerImage
            uri={backdropUrl}
            style={{
              position: "absolute",
              width: "100%",
              height: "100%",
            }}
            contentFit='cover'
            cachePolicy='memory-disk'
          />
        )}

        {/* Gradient Overlay */}
        <LinearGradient
          colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0.8)"]}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
          }}
        />

        {/* Content */}
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 40,
          }}
        >
          {/* Icon Container */}
          <BlurView
            intensity={60}
            tint='dark'
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              justifyContent: "center",
              alignItems: "center",
              overflow: "hidden",
              backgroundColor: "rgba(255,255,255,0.1)",
            }}
          >
            <Ionicons name={iconName} size={40} color='#FFFFFF' />
          </BlurView>

          {/* Text Content */}
          <View style={{ marginLeft: 24, flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: typography.heading,
                fontWeight: "700",
                color: "#FFFFFF",
                textShadowColor: "rgba(0,0,0,0.8)",
                textShadowOffset: { width: 0, height: 2 },
                textShadowRadius: 4,
              }}
            >
              {library.Name}
            </Text>
            {library.itemCount !== undefined && (
              <Text
                style={{
                  fontSize: typography.body,
                  color: "rgba(255,255,255,0.7)",
                  marginTop: 4,
                  textShadowColor: "rgba(0,0,0,0.8)",
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 2,
                }}
              >
                {library.itemCount} {itemTypeName}
              </Text>
            )}
          </View>

          {/* Arrow Indicator */}
          <Animated.View
            style={{
              opacity: focused ? 1 : 0.5,
            }}
          >
            <Ionicons name='chevron-forward' size={32} color='#FFFFFF' />
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
};

export const TVLibraries: React.FC = () => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const typography = useScaledTVTypography();

  const { data: userViews, isLoading: viewsLoading } = useQuery({
    queryKey: ["user-views", user?.Id],
    queryFn: async () => {
      const response = await getUserViewsApi(api!).getUserViews({
        userId: user?.Id,
      });
      return response.data.Items || [];
    },
    staleTime: 60 * 1000,
    enabled: !!api && !!user?.Id,
  });

  const libraries = useMemo(
    () =>
      userViews
        ?.filter((l) => !settings?.hiddenLibraries?.includes(l.Id!))
        .filter((l) => l.CollectionType !== "books")
        .filter((l) => l.CollectionType !== "music") || [],
    [userViews, settings?.hiddenLibraries],
  );

  // Fetch item counts and preview items for each library
  const { data: librariesWithData, isLoading: dataLoading } = useQuery({
    queryKey: ["library-data", libraries.map((l) => l.Id).join(",")],
    queryFn: async () => {
      const results: LibraryWithPreview[] = await Promise.all(
        libraries.map(async (library) => {
          let itemType: string | undefined;
          if (library.CollectionType === "movies") itemType = "Movie";
          else if (library.CollectionType === "tvshows") itemType = "Series";
          else if (library.CollectionType === "boxsets") itemType = "BoxSet";
          else if (library.CollectionType === "playlists")
            itemType = "Playlist";

          const isPlaylistsLib = library.CollectionType === "playlists";

          // Fetch count
          const countResponse = await getItemsApi(api!).getItems({
            userId: user?.Id,
            parentId: library.Id,
            recursive: true,
            limit: 0,
            includeItemTypes: itemType ? [itemType as any] : undefined,
            ...(isPlaylistsLib ? { mediaTypes: ["Video"] } : {}),
          });

          // Fetch preview items with backdrops
          const previewResponse = await getItemsApi(api!).getItems({
            userId: user?.Id,
            parentId: library.Id,
            recursive: true,
            limit: 1,
            sortBy: ["Random"],
            includeItemTypes: itemType ? [itemType as any] : undefined,
            imageTypes: ["Backdrop"],
            ...(isPlaylistsLib ? { mediaTypes: ["Video"] } : {}),
          });

          return {
            ...library,
            itemCount: countResponse.data.TotalRecordCount,
            previewItems: previewResponse.data.Items || [],
          };
        }),
      );
      return results;
    },
    enabled: !!api && !!user?.Id && libraries.length > 0,
    staleTime: 60 * 1000,
  });

  const handleLibraryPress = useCallback(
    (library: BaseItemDto) => {
      if (library.CollectionType === "livetv") {
        router.push("/(auth)/(tabs)/(libraries)/livetv/programs");
        return;
      }
      if (library.CollectionType === "music") {
        router.push({
          pathname: `/(auth)/(tabs)/(libraries)/music/[libraryId]/suggestions`,
          params: { libraryId: library.Id! },
        });
      } else {
        router.push({
          pathname: "/(auth)/(tabs)/(libraries)/[libraryId]",
          params: { libraryId: library.Id! },
        });
      }
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: LibraryWithPreview; index: number }) => (
      <View style={{ marginBottom: CARD_GAP, paddingHorizontal: 8 }}>
        <TVLibraryRow
          library={item}
          isFirst={index === 0}
          onPress={() => handleLibraryPress(item)}
        />
      </View>
    ),
    [handleLibraryPress],
  );

  const isLoading = viewsLoading || dataLoading;
  const displayLibraries = librariesWithData || libraries;

  if (isLoading && libraries.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Loader />
      </View>
    );
  }

  if (!displayLibraries || displayLibraries.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: typography.body, color: "#737373" }}>
          {t("library.no_libraries_found")}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top + 80,
        paddingBottom: insets.bottom + 40,
      }}
    >
      <FlatList
        data={displayLibraries}
        keyExtractor={(item) => item.Id || ""}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        contentContainerStyle={{
          paddingBottom: 40,
          paddingHorizontal: insets.left + HORIZONTAL_PADDING,
          paddingVertical: SCALE_PADDING,
        }}
      />
    </View>
  );
};
