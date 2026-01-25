import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, View, type ViewProps } from "react-native";
import ContinueWatchingPoster, {
  TV_LANDSCAPE_WIDTH,
} from "@/components/ContinueWatchingPoster.tv";
import { Text } from "@/components/common/Text";
import MoviePoster, {
  TV_POSTER_WIDTH,
} from "@/components/posters/MoviePoster.tv";
import SeriesPoster from "@/components/posters/SeriesPoster.tv";
import { TVFocusablePoster } from "@/components/tv/TVFocusablePoster";
import { TVTypography } from "@/constants/TVTypography";

const ITEM_GAP = 16;
const SCALE_PADDING = 20;

// TV-specific ItemCardText with larger fonts
const TVItemCardText: React.FC<{ item: BaseItemDto }> = ({ item }) => {
  return (
    <View style={{ marginTop: 12, flexDirection: "column" }}>
      {item.Type === "Episode" ? (
        <>
          <Text
            numberOfLines={1}
            style={{ fontSize: TVTypography.callout, color: "#FFFFFF" }}
          >
            {item.Name}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: TVTypography.callout,
              color: "#9CA3AF",
              marginTop: 2,
            }}
          >
            {`S${item.ParentIndexNumber?.toString()}:E${item.IndexNumber?.toString()}`}
            {" - "}
            {item.SeriesName}
          </Text>
        </>
      ) : item.Type === "MusicArtist" ? (
        <Text
          numberOfLines={2}
          style={{
            fontSize: TVTypography.callout,
            color: "#FFFFFF",
            textAlign: "center",
          }}
        >
          {item.Name}
        </Text>
      ) : item.Type === "MusicAlbum" ? (
        <>
          <Text
            numberOfLines={2}
            style={{ fontSize: TVTypography.callout, color: "#FFFFFF" }}
          >
            {item.Name}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: TVTypography.callout,
              color: "#9CA3AF",
              marginTop: 2,
            }}
          >
            {item.AlbumArtist || item.Artists?.join(", ")}
          </Text>
        </>
      ) : item.Type === "Audio" ? (
        <>
          <Text
            numberOfLines={2}
            style={{ fontSize: TVTypography.callout, color: "#FFFFFF" }}
          >
            {item.Name}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: TVTypography.callout,
              color: "#9CA3AF",
              marginTop: 2,
            }}
          >
            {item.Artists?.join(", ") || item.AlbumArtist}
          </Text>
        </>
      ) : item.Type === "Playlist" ? (
        <>
          <Text
            numberOfLines={2}
            style={{ fontSize: TVTypography.callout, color: "#FFFFFF" }}
          >
            {item.Name}
          </Text>
          <Text
            style={{
              fontSize: TVTypography.callout,
              color: "#9CA3AF",
              marginTop: 2,
            }}
          >
            {item.ChildCount} tracks
          </Text>
        </>
      ) : item.Type === "Person" ? (
        <Text
          numberOfLines={2}
          style={{ fontSize: TVTypography.callout, color: "#FFFFFF" }}
        >
          {item.Name}
        </Text>
      ) : (
        <>
          <Text
            numberOfLines={1}
            style={{ fontSize: TVTypography.callout, color: "#FFFFFF" }}
          >
            {item.Name}
          </Text>
          <Text
            style={{
              fontSize: TVTypography.callout,
              color: "#9CA3AF",
              marginTop: 2,
            }}
          >
            {item.ProductionYear}
          </Text>
        </>
      )}
    </View>
  );
};

interface TVSearchSectionProps extends ViewProps {
  title: string;
  items: BaseItemDto[];
  orientation?: "horizontal" | "vertical";
  disabled?: boolean;
  isFirstSection?: boolean;
  onItemPress: (item: BaseItemDto) => void;
  imageUrlGetter?: (item: BaseItemDto) => string | undefined;
}

export const TVSearchSection: React.FC<TVSearchSectionProps> = ({
  title,
  items,
  orientation = "vertical",
  disabled = false,
  isFirstSection = false,
  onItemPress,
  imageUrlGetter,
  ...props
}) => {
  const flatListRef = useRef<FlatList<BaseItemDto>>(null);
  const [focusedCount, setFocusedCount] = useState(0);
  const prevFocusedCount = useRef(0);

  // When section loses all focus, scroll back to start
  useEffect(() => {
    if (prevFocusedCount.current > 0 && focusedCount === 0) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
    prevFocusedCount.current = focusedCount;
  }, [focusedCount]);

  const handleItemFocus = useCallback(() => {
    setFocusedCount((c) => c + 1);
  }, []);

  const handleItemBlur = useCallback(() => {
    setFocusedCount((c) => Math.max(0, c - 1));
  }, []);

  const itemWidth =
    orientation === "horizontal" ? TV_LANDSCAPE_WIDTH : TV_POSTER_WIDTH;

  const getItemLayout = useCallback(
    (_data: ArrayLike<BaseItemDto> | null | undefined, index: number) => ({
      length: itemWidth + ITEM_GAP,
      offset: (itemWidth + ITEM_GAP) * index,
      index,
    }),
    [itemWidth],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: BaseItemDto; index: number }) => {
      const isFirstItem = isFirstSection && index === 0;
      const isHorizontal = orientation === "horizontal";

      const renderPoster = () => {
        // Music Artist - circular avatar
        if (item.Type === "MusicArtist") {
          const imageUrl = imageUrlGetter?.(item);
          return (
            <View
              style={{
                width: 160,
                height: 160,
                borderRadius: 80,
                overflow: "hidden",
                backgroundColor: "#1a1a1a",
              }}
            >
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit='cover'
                />
              ) : (
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#262626",
                  }}
                >
                  <Text style={{ fontSize: 48 }}>👤</Text>
                </View>
              )}
            </View>
          );
        }

        // Music Album, Audio, Playlist - square images
        if (
          item.Type === "MusicAlbum" ||
          item.Type === "Audio" ||
          item.Type === "Playlist"
        ) {
          const imageUrl = imageUrlGetter?.(item);
          const icon =
            item.Type === "Playlist"
              ? "🎶"
              : item.Type === "Audio"
                ? "🎵"
                : "🎵";
          return (
            <View
              style={{
                width: TV_POSTER_WIDTH,
                height: TV_POSTER_WIDTH,
                borderRadius: 12,
                overflow: "hidden",
                backgroundColor: "#1a1a1a",
              }}
            >
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit='cover'
                />
              ) : (
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#262626",
                  }}
                >
                  <Text style={{ fontSize: 64 }}>{icon}</Text>
                </View>
              )}
            </View>
          );
        }

        // Person (Actor)
        if (item.Type === "Person") {
          return <MoviePoster item={item} />;
        }

        // Episode rendering
        if (item.Type === "Episode" && isHorizontal) {
          return <ContinueWatchingPoster item={item} />;
        }
        if (item.Type === "Episode" && !isHorizontal) {
          return <SeriesPoster item={item} />;
        }

        // Movie rendering
        if (item.Type === "Movie" && isHorizontal) {
          return <ContinueWatchingPoster item={item} />;
        }
        if (item.Type === "Movie" && !isHorizontal) {
          return <MoviePoster item={item} />;
        }

        // Series rendering
        if (item.Type === "Series" && !isHorizontal) {
          return <SeriesPoster item={item} />;
        }
        if (item.Type === "Series" && isHorizontal) {
          return <ContinueWatchingPoster item={item} />;
        }

        // BoxSet (Collection)
        if (item.Type === "BoxSet" && !isHorizontal) {
          return <MoviePoster item={item} />;
        }
        if (item.Type === "BoxSet" && isHorizontal) {
          return <ContinueWatchingPoster item={item} />;
        }

        // Default fallback
        return isHorizontal ? (
          <ContinueWatchingPoster item={item} />
        ) : (
          <MoviePoster item={item} />
        );
      };

      // Special width for music artists (circular)
      const actualItemWidth = item.Type === "MusicArtist" ? 160 : itemWidth;

      return (
        <View style={{ marginRight: ITEM_GAP, width: actualItemWidth }}>
          <TVFocusablePoster
            onPress={() => onItemPress(item)}
            hasTVPreferredFocus={isFirstItem && !disabled}
            onFocus={handleItemFocus}
            onBlur={handleItemBlur}
            disabled={disabled}
          >
            {renderPoster()}
          </TVFocusablePoster>
          <TVItemCardText item={item} />
        </View>
      );
    },
    [
      orientation,
      isFirstSection,
      itemWidth,
      onItemPress,
      handleItemFocus,
      handleItemBlur,
      disabled,
      imageUrlGetter,
    ],
  );

  if (!items || items.length === 0) return null;

  return (
    <View style={{ overflow: "visible" }} {...props}>
      {/* Section Header */}
      <Text
        style={{
          fontSize: TVTypography.heading,
          fontWeight: "700",
          color: "#FFFFFF",
          marginBottom: 20,
          marginLeft: SCALE_PADDING,
          letterSpacing: 0.5,
        }}
      >
        {title}
      </Text>

      <FlatList
        ref={flatListRef}
        horizontal
        data={items}
        keyExtractor={(item) => item.Id!}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        initialNumToRender={5}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews={false}
        getItemLayout={getItemLayout}
        style={{ overflow: "visible" }}
        contentContainerStyle={{
          paddingVertical: SCALE_PADDING,
          paddingHorizontal: SCALE_PADDING,
        }}
      />
    </View>
  );
};
