import {
  router,
  useLocalSearchParams,
  useNavigation,
  useSegments,
} from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TouchableOpacity, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ParallaxScrollView } from "@/components/ParallaxPage";
import { Text } from "@/components/common/Text";
import { Animated } from "react-native";
import { Image } from "expo-image";
import { OverviewText } from "@/components/OverviewText";
import { orderBy } from "lodash";
import { FlashList } from "@shopify/flash-list";
import { PersonCreditCast } from "@/utils/jellyseerr/server/models/Person";
import Poster from "@/components/posters/Poster";
import JellyseerrMediaIcon from "@/components/jellyseerr/JellyseerrMediaIcon";

const ANIMATION_ENTER = 250;
const ANIMATION_EXIT = 250;
const BACKDROP_DURATION = 5000;

export default function page() {
  const insets = useSafeAreaInsets();
  const local = useLocalSearchParams();
  const segments = useSegments();
  const { jellyseerrApi, jellyseerrUser } = useJellyseerr();

  const { personId } = local as { personId: string };
  const from = segments[2];

  const [currentIndex, setCurrentIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["jellyseerr", "person", personId],
    queryFn: async () => ({
      details: await jellyseerrApi?.personDetails(personId),
      combinedCredits: await jellyseerrApi?.personCombinedCredits(personId),
    }),
    enabled: !!jellyseerrApi && !!personId,
  });

  const locale = useMemo(() => {
    return jellyseerrUser?.settings?.locale || "en";
  }, [jellyseerrUser]);

  const region = useMemo(
    () => jellyseerrUser?.settings?.region || "US",
    [jellyseerrUser]
  );

  const castedRoles: PersonCreditCast[] = useMemo(
    () =>
      orderBy(
        data?.combinedCredits?.cast,
        ["voteCount", "voteAverage"],
        "desc"
      ),
    [data?.combinedCredits]
  );

  const backdrops = useMemo(
    () => castedRoles.map((c) => c.backdropPath),
    [data?.combinedCredits]
  );

  const enterAnimation = useCallback(
    () =>
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: ANIMATION_ENTER,
        useNativeDriver: true,
      }),
    [fadeAnim]
  );

  const exitAnimation = useCallback(
    () =>
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: ANIMATION_EXIT,
        useNativeDriver: true,
      }),
    [fadeAnim]
  );

  useEffect(() => {
    if (backdrops?.length) {
      enterAnimation().start();
      const intervalId = setInterval(() => {
        exitAnimation().start((end) => {
          if (end.finished)
            setCurrentIndex((prevIndex) => (prevIndex + 1) % backdrops?.length);
        });
      }, BACKDROP_DURATION);

      return () => clearInterval(intervalId);
    }
  }, [backdrops, enterAnimation, exitAnimation, setCurrentIndex, currentIndex]);

  const viewDetails = (credit: PersonCreditCast) => {
    router.push({
      //@ts-ignore
      pathname: `/(auth)/(tabs)/${from}/jellyseerr/page`,
      //@ts-ignore
      params: {
        ...credit,
        mediaTitle: credit.title,
        releaseYear: new Date(credit.releaseDate).getFullYear(),
        canRequest: "false",
        posterSrc: jellyseerrApi?.imageProxy(
          credit.posterPath,
          "w300_and_h450_face"
        ),
      },
    });
  };

  return (
    <View
      className="flex-1 relative"
      style={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <ParallaxScrollView
        className="flex-1 opacity-100"
        headerHeight={300}
        headerImage={
          <Animated.Image
            source={{
              uri: jellyseerrApi?.imageProxy(
                backdrops?.[currentIndex],
                "w1920_and_h800_multi_faces"
              ),
            }}
            style={{
              width: "100%",
              height: "100%",
              opacity: fadeAnim,
            }}
          />
        }
        logo={
          <Image
            key={data?.details?.id}
            id={data?.details?.id.toString()}
            className="rounded-full bottom-1"
            source={{
              uri: jellyseerrApi?.imageProxy(
                data?.details?.profilePath,
                "w600_and_h600_bestv2"
              ),
            }}
            cachePolicy={"memory-disk"}
            contentFit="cover"
            style={{
              width: 125,
              height: 125,
            }}
          />
        }
      >
        <View className="flex flex-col space-y-4 px-4">
          <View className="flex flex-row justify-between w-full">
            <View className="flex flex-col w-full">
              <Text className="font-bold text-2xl mb-1">
                {data?.details?.name}
              </Text>
              <Text className="opacity-50">
                Born{" "}
                {new Date(data?.details?.birthday!!).toLocaleDateString(
                  `${locale}-${region}`,
                  {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  }
                )}{" "}
                | {data?.details?.placeOfBirth}
              </Text>
            </View>
          </View>
          <OverviewText text={data?.details?.biography} className="mt-4" />

          <View>
            <FlashList
              data={castedRoles}
              ListEmptyComponent={
                <View className="flex flex-col items-center justify-center h-full">
                  <Text className="font-bold text-xl text-neutral-500">
                    No results
                  </Text>
                </View>
              }
              contentInsetAdjustmentBehavior="automatic"
              ListHeaderComponent={
                <Text className="text-lg font-bold my-2">Appearances</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  className="w-full flex flex-col pr-2"
                  onPress={() => viewDetails(item)}
                >
                  <Poster
                    id={item.id.toString()}
                    url={jellyseerrApi?.imageProxy(item.posterPath)}
                  />
                  <JellyseerrMediaIcon
                    className="absolute top-1 left-1"
                    mediaType={item.mediaType as "movie" | "tv"}
                  />
                  {/*<Text numberOfLines={1}>{item.title}</Text>*/}
                  {item.character && (
                    <Text
                      className="text-xs opacity-50 align-bottom mt-1"
                      numberOfLines={1}
                    >
                      as {item.character}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.id.toString()}
              estimatedItemSize={255}
              numColumns={3}
              contentContainerStyle={{ paddingBottom: 24 }}
              ItemSeparatorComponent={() => <View className="h-2 w-2" />}
            />
          </View>
        </View>
      </ParallaxScrollView>
    </View>
  );
}
