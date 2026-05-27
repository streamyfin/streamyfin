import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, View, type ViewProps } from "react-native";
import { Text } from "@/components/common/Text";
import { TVFocusablePoster } from "@/components/tv/TVFocusablePoster";
import { TVPosterCard } from "@/components/tv/TVPosterCard";
import { useScaledTVPosterSizes } from "@/constants/TVPosterSizes";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";

const SCALE_PADDING = 20;

interface TVSearchSectionProps extends ViewProps {
  title: string;
  items: BaseItemDto[];
  orientation?: "horizontal" | "vertical";
  disabled?: boolean;
  isFirstSection?: boolean;
  onItemPress: (item: BaseItemDto) => void;
  onItemLongPress?: (item: BaseItemDto) => void;
  imageUrlGetter?: (item: BaseItemDto) => string | undefined;
}

export const TVSearchSection: React.FC<TVSearchSectionProps> = ({
  title,
  items,
  orientation = "vertical",
  disabled = false,
  isFirstSection = false,
  onItemPress,
  onItemLongPress,
  imageUrlGetter,
  ...props
}) => {
  const typography = useScaledTVTypography();
  const posterSizes = useScaledTVPosterSizes();
  const sizes = useScaledTVSizes();
  const ITEM_GAP = sizes.gaps.item;
  const flatListRef = useRef<FlatList<BaseItemDto>>(null);
  const [focusedCount, setFocusedCount] = useState(0);
  const prevFocusedCount = useRef(0);

  // Track focus count for section
  useEffect(() => {
    prevFocusedCount.current = focusedCount;
  }, [focusedCount]);

  const handleItemFocus = useCallback(() => {
    setFocusedCount((c) => c + 1);
  }, []);

  const handleItemBlur = useCallback(() => {
    setFocusedCount((c) => Math.max(0, c - 1));
  }, []);

  const itemWidth =
    orientation === "horizontal" ? posterSizes.landscape : posterSizes.poster;

  const getItemLayout = useCallback(
    (_data: ArrayLike<BaseItemDto> | null | undefined, index: number) => ({
      length: itemWidth + ITEM_GAP,
      offset: (itemWidth + ITEM_GAP) * index,
      index,
    }),
    [itemWidth, ITEM_GAP],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: BaseItemDto; index: number }) => {
      const isFirstItem = isFirstSection && index === 0;

      // Special handling for MusicArtist (circular avatar)
      if (item.Type === "MusicArtist") {
        const imageUrl = imageUrlGetter?.(item);
        return (
          <View style={{ marginRight: ITEM_GAP, width: 160 }}>
            <TVFocusablePoster
              onPress={() => onItemPress(item)}
              onLongPress={
                onItemLongPress ? () => onItemLongPress(item) : undefined
              }
              hasTVPreferredFocus={isFirstItem && !disabled}
              onFocus={handleItemFocus}
              onBlur={handleItemBlur}
              disabled={disabled}
            >
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
            </TVFocusablePoster>
            <View style={{ marginTop: 12, flexDirection: "column" }}>
              <Text
                numberOfLines={2}
                style={{
                  fontSize: typography.callout,
                  color: "#FFFFFF",
                  textAlign: "center",
                }}
              >
                {item.Name}
              </Text>
            </View>
          </View>
        );
      }

      // Special handling for MusicAlbum, Audio, Playlist (square images)
      if (
        item.Type === "MusicAlbum" ||
        item.Type === "Audio" ||
        item.Type === "Playlist"
      ) {
        const imageUrl = imageUrlGetter?.(item);
        const icon =
          item.Type === "Playlist" ? "🎶" : item.Type === "Audio" ? "🎵" : "🎵";
        return (
          <View style={{ marginRight: ITEM_GAP, width: posterSizes.poster }}>
            <TVFocusablePoster
              onPress={() => onItemPress(item)}
              onLongPress={
                onItemLongPress ? () => onItemLongPress(item) : undefined
              }
              hasTVPreferredFocus={isFirstItem && !disabled}
              onFocus={handleItemFocus}
              onBlur={handleItemBlur}
              disabled={disabled}
            >
              <View
                style={{
                  width: posterSizes.poster,
                  height: posterSizes.poster,
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
            </TVFocusablePoster>
            <View style={{ marginTop: 12, flexDirection: "column" }}>
              <Text
                numberOfLines={2}
                style={{ fontSize: typography.callout, color: "#FFFFFF" }}
              >
                {item.Name}
              </Text>
              {item.Type === "MusicAlbum" && (
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: typography.callout,
                    color: "#9CA3AF",
                    marginTop: 2,
                  }}
                >
                  {item.AlbumArtist || item.Artists?.join(", ")}
                </Text>
              )}
              {item.Type === "Audio" && (
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: typography.callout,
                    color: "#9CA3AF",
                    marginTop: 2,
                  }}
                >
                  {item.Artists?.join(", ") || item.AlbumArtist}
                </Text>
              )}
              {item.Type === "Playlist" && (
                <Text
                  style={{
                    fontSize: typography.callout,
                    color: "#9CA3AF",
                    marginTop: 2,
                  }}
                >
                  {item.ChildCount} tracks
                </Text>
              )}
            </View>
          </View>
        );
      }

      // Use TVPosterCard for all other item types
      return (
        <View style={{ marginRight: ITEM_GAP }}>
          <TVPosterCard
            item={item}
            orientation={orientation}
            onPress={() => onItemPress(item)}
            onLongPress={
              onItemLongPress ? () => onItemLongPress(item) : undefined
            }
            hasTVPreferredFocus={isFirstItem && !disabled}
            onFocus={handleItemFocus}
            onBlur={handleItemBlur}
            disabled={disabled}
            width={itemWidth}
          />
        </View>
      );
    },
    [
      orientation,
      isFirstSection,
      itemWidth,
      onItemPress,
      onItemLongPress,
      handleItemFocus,
      handleItemBlur,
      disabled,
      imageUrlGetter,
      posterSizes.poster,
      typography.callout,
      ITEM_GAP,
    ],
  );

  if (!items || items.length === 0) return null;

  return (
    <View style={{ overflow: "visible" }} {...props}>
      {/* Section Header */}
      <Text
        style={{
          fontSize: typography.heading,
          fontWeight: "700",
          color: "#FFFFFF",
          marginBottom: 20,
          marginLeft: sizes.padding.horizontal,
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
        contentInset={{
          left: sizes.padding.horizontal,
          right: sizes.padding.horizontal,
        }}
        contentOffset={{ x: -sizes.padding.horizontal, y: 0 }}
        contentContainerStyle={{
          paddingVertical: SCALE_PADDING,
        }}
      />
    </View>
  );
};
