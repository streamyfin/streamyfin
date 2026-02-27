import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useAtomValue } from "jotai";
import { useCallback, useMemo, useRef } from "react";
import { Dimensions, Pressable, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import Carousel, {
  type ICarouselInstance,
  Pagination,
} from "react-native-reanimated-carousel";
import { Text } from "@/components/common/Text";
import { Tags } from "@/components/GenreTags";
import useRouter from "@/hooks/useAppRouter";
import { useHaptic } from "@/hooks/useHaptic";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import { getItemNavigation } from "../common/TouchableItemRouter";

type Props = {
  items: BaseItemDto[];
  isLoading?: boolean;
  compact?: boolean;
};

const getYear = (item: BaseItemDto): string | null => {
  if (item.ProductionYear) return item.ProductionYear.toString();
  if (!item.PremiereDate) return null;

  const parsed = new Date(item.PremiereDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getFullYear().toString();
};

const formatMetaLine = (item: BaseItemDto): string => {
  const rating =
    typeof item.CommunityRating === "number"
      ? `★ ${item.CommunityRating.toFixed(1)}`
      : null;
  const year = getYear(item);
  const type = item.OfficialRating || item.Type || null;

  return [rating, year, type].filter(Boolean).join(" • ");
};

const MediaBarCard = ({
  item,
  width,
  height,
  compact,
  onPress,
}: {
  item: BaseItemDto;
  width: number;
  height: number;
  compact: boolean;
  onPress: () => void;
}) => {
  const api = useAtomValue(apiAtom);

  const backdropUri = useMemo(() => {
    return getBackdropUrl({
      api,
      item,
      quality: 70,
      width: Math.floor(width * 2),
    });
  }, [api, item, width]);

  const logoUri = useMemo(() => {
    return getLogoImageUrlById({
      api,
      item,
      height: compact ? 48 : 72,
    });
  }, [api, item, compact]);

  const metadata = useMemo(() => formatMetaLine(item), [item]);
  const genres = useMemo(() => (item.Genres || []).slice(0, 3), [item.Genres]);

  return (
    <Pressable
      onPress={onPress}
      style={{
        width,
        height,
        borderRadius: 18,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "#262626",
        backgroundColor: "#0f0f10",
      }}
    >
      {backdropUri ? (
        <Image
          source={{ uri: backdropUri }}
          style={{ position: "absolute", width: "100%", height: "100%" }}
          contentFit='cover'
        />
      ) : null}

      <View
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          backgroundColor: "rgba(0,0,0,0.35)",
        }}
      />

      <LinearGradient
        colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.92)"]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: compact ? 150 : 190,
        }}
      />

      <View
        style={{
          position: "absolute",
          left: 14,
          right: 14,
          bottom: 14,
        }}
      >
        {logoUri ? (
          <Image
            source={{ uri: logoUri }}
            contentFit='contain'
            style={{
              width: "75%",
              height: compact ? 48 : 72,
            }}
          />
        ) : (
          <Text className='text-white text-2xl font-semibold'>{item.Name}</Text>
        )}

        {metadata ? (
          <Text className='text-neutral-300 text-xs mt-1'>{metadata}</Text>
        ) : null}

        {item.Overview ? (
          <Text className='text-neutral-100 text-xs mt-1' numberOfLines={2}>
            {item.Overview}
          </Text>
        ) : null}

        {genres.length > 0 ? (
          <Tags tags={genres} className='mt-2' textClass='text-[10px]' />
        ) : null}
      </View>
    </Pressable>
  );
};

export const MediaBarCarousel: React.FC<Props> = ({
  items,
  isLoading = false,
  compact = false,
}) => {
  const router = useRouter();
  const lightHapticFeedback = useHaptic("light");
  const ref = useRef<ICarouselInstance>(null);
  const progress = useSharedValue<number>(0);

  const width = Dimensions.get("window").width;
  const cardWidth = width - 32;
  const cardHeight = compact ? 230 : 280;

  const onPressPagination = (index: number) => {
    ref.current?.scrollTo({
      count: index - progress.value,
      animated: true,
    });
  };

  const handlePressItem = useCallback(
    (item: BaseItemDto) => {
      lightHapticFeedback();
      const navigation = getItemNavigation(item, "(home)");
      router.push(navigation as any);
    },
    [lightHapticFeedback, router],
  );

  if (!isLoading && items.length === 0) return null;

  if (isLoading && items.length === 0) {
    return (
      <View className='flex flex-col'>
        <View className='px-4'>
          <View
            className='rounded-2xl border border-neutral-800 bg-neutral-900'
            style={{ height: cardHeight }}
          />
          <View className='flex-row items-center justify-center gap-1 mt-3'>
            {[0, 1, 2].map((dot) => (
              <View
                key={dot}
                className='rounded-full bg-white/30'
                style={{ width: dot === 1 ? 18 : 10, height: 6 }}
              />
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className='flex flex-col'>
      <Carousel
        ref={ref}
        width={width}
        height={cardHeight}
        data={items}
        loop={items.length > 1}
        autoPlay={items.length > 1}
        autoPlayInterval={7000}
        snapEnabled
        mode='parallax'
        modeConfig={{
          parallaxScrollingScale: 0.96,
          parallaxScrollingOffset: 36,
        }}
        onProgressChange={progress}
        renderItem={({ item }) => (
          <View className='px-4'>
            <MediaBarCard
              item={item}
              width={cardWidth}
              height={cardHeight}
              compact={compact}
              onPress={() => handlePressItem(item)}
            />
          </View>
        )}
      />
      {items.length > 1 ? (
        <Pagination.Basic
          progress={progress}
          data={items}
          dotStyle={{
            backgroundColor: "rgba(255,255,255,0.25)",
            borderRadius: 99,
          }}
          activeDotStyle={{
            backgroundColor: "rgba(255,255,255,0.85)",
            borderRadius: 99,
          }}
          containerStyle={{ gap: 5, marginTop: 12 }}
          onPress={onPressPagination}
        />
      ) : null}
    </View>
  );
};
