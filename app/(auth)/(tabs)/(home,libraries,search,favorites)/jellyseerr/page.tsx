import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { GenreTags } from "@/components/GenreTags";
import Cast from "@/components/jellyseerr/Cast";
import DetailFacts from "@/components/jellyseerr/DetailFacts";
import { OverviewText } from "@/components/OverviewText";
import { ParallaxScrollView } from "@/components/ParallaxPage";
import { JellyserrRatings } from "@/components/Ratings";
import JellyseerrSeasons from "@/components/series/JellyseerrSeasons";
import { ItemActions } from "@/components/series/SeriesActions";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { useJellyseerrCanRequest } from "@/utils/_jellyseerr/useJellyseerrCanRequest";
import {
  IssueType,
  IssueTypeName,
} from "@/utils/jellyseerr/server/constants/issue";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import { MovieResult, TvResult } from "@/utils/jellyseerr/server/models/Search";
import { TvDetails } from "@/utils/jellyseerr/server/models/Tv";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation } from "expo-router";
import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import { TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DropdownMenu from "zeego/dropdown-menu";
import RequestModal from "@/components/jellyseerr/RequestModal";
import {ANIME_KEYWORD_ID} from "@/utils/jellyseerr/server/api/themoviedb/constants";
import {MediaRequestBody} from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";

const Page: React.FC = () => {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { t } = useTranslation();

  const { mediaTitle, releaseYear, posterSrc, ...result } =
    params as unknown as {
      mediaTitle: string;
      releaseYear: number;
      canRequest: string;
      posterSrc: string;
    } & Partial<MovieResult | TvResult>;

  const navigation = useNavigation();
  const { jellyseerrApi, requestMedia } = useJellyseerr();

  const [issueType, setIssueType] = useState<IssueType>();
  const [issueMessage, setIssueMessage] = useState<string>();
  const advancedReqModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  const {
    data: details,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    enabled: !!jellyseerrApi && !!result && !!result.id,
    queryKey: ["jellyseerr", "detail", result.mediaType, result.id],
    staleTime: 0,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    retryOnMount: true,
    refetchInterval: 0,
    queryFn: async () => {
      return result.mediaType === MediaType.MOVIE
        ? jellyseerrApi?.movieDetails(result.id!!)
        : jellyseerrApi?.tvDetails(result.id!!);
    },
  });

  const [canRequest, hasAdvancedRequestPermission] = useJellyseerrCanRequest(details);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    []
  );

  const submitIssue = useCallback(() => {
    if (result.id && issueType && issueMessage && details) {
      jellyseerrApi
        ?.submitIssue(details.mediaInfo.id, Number(issueType), issueMessage)
        .then(() => {
          setIssueType(undefined);
          setIssueMessage(undefined);
          bottomSheetModalRef?.current?.close();
        });
    }
  }, [jellyseerrApi, details, result, issueType, issueMessage]);

  const request = useCallback(async () => {
    const body: MediaRequestBody = {
      mediaId: Number(result.id!!),
      mediaType: result.mediaType!!,
      tvdbId: details?.externalIds?.tvdbId,
      seasons: (details as TvDetails)?.seasons
        ?.filter?.((s) => s.seasonNumber !== 0)
        ?.map?.((s) => s.seasonNumber),
    }

    if (hasAdvancedRequestPermission) {
      advancedReqModalRef?.current?.present?.(body)
      return
    }

    requestMedia(mediaTitle, body, refetch);
  }, [details, result, requestMedia, hasAdvancedRequestPermission]);

  const isAnime = useMemo(
    () => (details?.keywords.some(k => k.id === ANIME_KEYWORD_ID) || false) && result.mediaType === MediaType.TV,
    [details]
  )

  useEffect(() => {
    if (details) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity className="rounded-full p-2 bg-neutral-800/80">
            <ItemActions item={details} />
          </TouchableOpacity>
        ),
      });
    }
  }, [details]);

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
          <View>
            {result.backdropPath ? (
              <Image
                cachePolicy={"memory-disk"}
                transition={300}
                style={{
                  width: "100%",
                  height: "100%",
                }}
                source={{
                  uri: jellyseerrApi?.imageProxy(
                    result.backdropPath,
                    "w1920_and_h800_multi_faces"
                  ),
                }}
              />
            ) : (
              <View
                style={{
                  width: "100%",
                  height: "100%",
                }}
                className="flex flex-col items-center justify-center border border-neutral-800 bg-neutral-900"
              >
                <Ionicons
                  name="image-outline"
                  size={24}
                  color="white"
                  style={{ opacity: 0.4 }}
                />
              </View>
            )}
          </View>
        }
      >
        <View className="flex flex-col">
          <View className="space-y-4">
            <View className="px-4">
              <View className="flex flex-row justify-between w-full">
                <View className="flex flex-col w-56">
                  <JellyserrRatings result={result as MovieResult | TvResult} />
                  <Text
                    uiTextView
                    selectable
                    className="font-bold text-2xl mb-1"
                  >
                    {mediaTitle}
                  </Text>
                  <Text className="opacity-50">{releaseYear}</Text>
                </View>
                <Image
                  className="absolute bottom-1 right-1 rounded-lg w-28 aspect-[10/15] border-2 border-neutral-800/50 drop-shadow-2xl"
                  cachePolicy={"memory-disk"}
                  transition={300}
                  source={{
                    uri: posterSrc,
                  }}
                />
              </View>
              <View className="mb-4">
                <GenreTags genres={details?.genres?.map((g) => g.name) || []} />
              </View>
              {isLoading || isFetching ? (
                <Button loading={true} disabled={true} color="purple"></Button>
              ) : canRequest ? (
                <Button color="purple" onPress={request}>
                  {t("jellyseerr.request_button")}
                </Button>
              ) : (
                <Button
                  className="bg-yellow-500/50 border-yellow-400 ring-yellow-400 text-yellow-100"
                  color="transparent"
                  onPress={() => bottomSheetModalRef?.current?.present()}
                  iconLeft={
                    <Ionicons name="warning-outline" size={24} color="white" />
                  }
                  style={{
                    borderWidth: 1,
                    borderStyle: "solid",
                  }}
                >
                  {t("jellyseerr.report_issue_button")}
                </Button>
              )}
              <OverviewText text={result.overview} className="mt-4" />
            </View>

            {result.mediaType === MediaType.TV && (
              <JellyseerrSeasons
                isLoading={isLoading || isFetching}
                result={result as TvResult}
                details={details as TvDetails}
                refetch={refetch}
                hasAdvancedRequest={hasAdvancedRequestPermission}
                onAdvancedRequest={(data) =>
                  advancedReqModalRef?.current?.present(data)
              }
              />
            )}
            <DetailFacts
              className="p-2 border border-neutral-800 bg-neutral-900 rounded-xl"
              details={details}
            />
            <Cast details={details} />
          </View>
        </View>
      </ParallaxScrollView>
      <RequestModal
        ref={advancedReqModalRef}
        title={mediaTitle}
        id={result.id!!}
        type={result.mediaType as MediaType}
        isAnime={isAnime}
        onRequested={() => {
          advancedReqModalRef?.current?.close()
          refetch()
        }}
      />
      <BottomSheetModal
        ref={bottomSheetModalRef}
        enableDynamicSizing
        handleIndicatorStyle={{
          backgroundColor: "white",
        }}
        backgroundStyle={{
          backgroundColor: "#171717",
        }}
        backdropComponent={renderBackdrop}
      >
        <BottomSheetView>
          <View className="flex flex-col space-y-4 px-4 pb-8 pt-2">
            <View>
              <Text className="font-bold text-2xl text-neutral-100">
                {t("jellyseerr.whats_wrong")}
              </Text>
            </View>
            <View className="flex flex-col space-y-2 items-start">
              <View className="flex flex-col">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    <View className="flex flex-col">
                      <Text className="opacity-50 mb-1 text-xs">
                        {t("jellyseerr.issue_type")}
                      </Text>
                      <TouchableOpacity className="bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between">
                        <Text style={{}} className="" numberOfLines={1}>
                          {issueType
                            ? IssueTypeName[issueType]
                            : t("jellyseerr.select_an_issue")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content
                    loop={false}
                    side="bottom"
                    align="center"
                    alignOffset={0}
                    avoidCollisions={true}
                    collisionPadding={0}
                    sideOffset={0}
                  >
                    <DropdownMenu.Label>{t("jellyseerr.types")}</DropdownMenu.Label>
                    {Object.entries(IssueTypeName)
                      .reverse()
                      .map(([key, value], idx) => (
                        <DropdownMenu.Item
                          key={value}
                          onSelect={() =>
                            setIssueType(key as unknown as IssueType)
                          }
                        >
                          <DropdownMenu.ItemTitle>
                            {value}
                          </DropdownMenu.ItemTitle>
                        </DropdownMenu.Item>
                      ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </View>

              <View className="p-4 border border-neutral-800 rounded-xl bg-neutral-900 w-full">
                <BottomSheetTextInput
                  multiline
                  maxLength={254}
                  style={{ color: "white" }}
                  clearButtonMode="always"
                  placeholder={t("jellyseerr.describe_the_issue")}
                  placeholderTextColor="#9CA3AF"
                  // Issue with multiline + Textinput inside a portal
                  // https://github.com/callstack/react-native-paper/issues/1668
                  defaultValue={issueMessage}
                  onChangeText={setIssueMessage}
                />
              </View>
            </View>
            <Button className="mt-auto" onPress={submitIssue} color="purple">
              {t("jellyseerr.submit_button")}
            </Button>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
};

export default Page;
