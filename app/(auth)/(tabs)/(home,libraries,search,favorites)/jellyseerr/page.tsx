import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { GenreTags } from "@/components/GenreTags";
import Cast from "@/components/jellyseerr/Cast";
import DetailFacts from "@/components/jellyseerr/DetailFacts";
import RequestModal from "@/components/jellyseerr/RequestModal";
import { OverviewText } from "@/components/OverviewText";
import { ParallaxScrollView } from "@/components/ParallaxPage";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { JellyserrRatings } from "@/components/Ratings";
import JellyseerrSeasons from "@/components/series/JellyseerrSeasons";
import { ItemActions } from "@/components/series/SeriesActions";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { useJellyseerrCanRequest } from "@/utils/_jellyseerr/useJellyseerrCanRequest";
import { ANIME_KEYWORD_ID } from "@/utils/jellyseerr/server/api/themoviedb/constants";
import {
  type IssueType,
  IssueTypeName,
} from "@/utils/jellyseerr/server/constants/issue";
import {
  MediaRequestStatus,
  MediaType,
} from "@/utils/jellyseerr/server/constants/media";
import type MediaRequest from "@/utils/jellyseerr/server/entity/MediaRequest";
import type { MediaRequestBody } from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";
import {
  hasPermission,
  Permission,
} from "@/utils/jellyseerr/server/lib/permissions";
import type { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import type {
  MovieResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";
import type { TvDetails } from "@/utils/jellyseerr/server/models/Tv";

const Page: React.FC = () => {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { t } = useTranslation();
  const router = useRouter();

  const { mediaTitle, releaseYear, posterSrc, mediaType, ...result } =
    params as unknown as {
      mediaTitle: string;
      releaseYear: number;
      canRequest: string;
      posterSrc: string;
      mediaType: MediaType;
    } & Partial<MovieResult | TvResult | MovieDetails | TvDetails>;

  const navigation = useNavigation();
  const { jellyseerrApi, jellyseerrUser, requestMedia } = useJellyseerr();

  const [issueType, setIssueType] = useState<IssueType>();
  const [issueMessage, setIssueMessage] = useState<string>();
  const [requestBody, _setRequestBody] = useState<MediaRequestBody>();
  const [issueTypeDropdownOpen, setIssueTypeDropdownOpen] = useState(false);
  const advancedReqModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  const {
    data: details,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    enabled: !!jellyseerrApi && !!result && !!result.id,
    queryKey: ["jellyseerr", "detail", mediaType, result.id],
    staleTime: 0,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    retryOnMount: true,
    refetchInterval: 0,
    queryFn: async () => {
      return mediaType === MediaType.MOVIE
        ? jellyseerrApi?.movieDetails(result.id!)
        : jellyseerrApi?.tvDetails(result.id!);
    },
  });

  const [canRequest, hasAdvancedRequestPermission] =
    useJellyseerrCanRequest(details);

  const canManageRequests = useMemo(() => {
    if (!jellyseerrUser) return false;
    return hasPermission(
      Permission.MANAGE_REQUESTS,
      jellyseerrUser.permissions,
    );
  }, [jellyseerrUser]);

  const pendingRequest = useMemo(() => {
    return details?.mediaInfo?.requests?.find(
      (r: MediaRequest) => r.status === MediaRequestStatus.PENDING,
    );
  }, [details]);

  const handleApproveRequest = useCallback(async () => {
    if (!pendingRequest?.id) return;

    try {
      await jellyseerrApi?.approveRequest(pendingRequest.id);
      toast.success(t("jellyseerr.toasts.request_approved"));
      refetch();
    } catch (error) {
      toast.error(t("jellyseerr.toasts.failed_to_approve_request"));
      console.error("Failed to approve request:", error);
    }
  }, [jellyseerrApi, pendingRequest, refetch, t]);

  const handleDeclineRequest = useCallback(async () => {
    if (!pendingRequest?.id) return;

    try {
      await jellyseerrApi?.declineRequest(pendingRequest.id);
      toast.success(t("jellyseerr.toasts.request_declined"));
      refetch();
    } catch (error) {
      toast.error(t("jellyseerr.toasts.failed_to_decline_request"));
      console.error("Failed to decline request:", error);
    }
  }, [jellyseerrApi, pendingRequest, refetch, t]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    [],
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

  const handleIssueModalDismiss = useCallback(() => {
    setIssueTypeDropdownOpen(false);
  }, []);

  const setRequestBody = useCallback(
    (body: MediaRequestBody) => {
      _setRequestBody(body);
      advancedReqModalRef?.current?.present?.();
    },
    [requestBody, _setRequestBody, advancedReqModalRef],
  );

  const request = useCallback(async () => {
    const body: MediaRequestBody = {
      mediaId: Number(result.id!),
      mediaType: mediaType!,
      tvdbId: details?.externalIds?.tvdbId,
      ...(mediaType === MediaType.TV && {
        seasons: (details as TvDetails)?.seasons
          ?.filter?.((s) => s.seasonNumber !== 0)
          ?.map?.((s) => s.seasonNumber),
      }),
    };

    if (hasAdvancedRequestPermission) {
      setRequestBody(body);
      return;
    }

    requestMedia(mediaTitle, body, refetch);
  }, [
    details,
    result,
    requestMedia,
    hasAdvancedRequestPermission,
    mediaTitle,
    refetch,
    mediaType,
  ]);

  const isAnime = useMemo(
    () =>
      (details?.keywords.some((k) => k.id === ANIME_KEYWORD_ID) || false) &&
      mediaType === MediaType.TV,
    [details],
  );

  const issueTypeOptionGroups = useMemo(
    () => [
      {
        title: t("jellyseerr.types"),
        options: Object.entries(IssueTypeName)
          .reverse()
          .map(([key, value]) => ({
            type: "radio" as const,
            label: value,
            value: key,
            selected: key === String(issueType),
            onPress: () => setIssueType(key as unknown as IssueType),
          })),
      },
    ],
    [issueType, t],
  );

  useEffect(() => {
    if (details) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity
            className={`rounded-full pl-1.5 ${Platform.OS === "android" ? "" : "bg-neutral-800/80"}`}
          >
            <ItemActions item={details} />
          </TouchableOpacity>
        ),
      });
    }
  }, [details]);

  return (
    <View
      className='flex-1 relative'
      style={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <ParallaxScrollView
        className='flex-1 opacity-100'
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
                    "w1920_and_h800_multi_faces",
                  ),
                }}
              />
            ) : (
              <View
                style={{
                  width: "100%",
                  height: "100%",
                }}
                className='flex flex-col items-center justify-center border border-neutral-800 bg-neutral-900'
              >
                <Ionicons
                  name='image-outline'
                  size={24}
                  color='white'
                  style={{ opacity: 0.4 }}
                />
              </View>
            )}
          </View>
        }
      >
        <View className='flex flex-col'>
          <View className='space-y-4'>
            <View className='px-4'>
              <View className='flex flex-row justify-between w-full'>
                <View className='flex flex-col w-56'>
                  <JellyserrRatings
                    result={
                      result as
                        | MovieResult
                        | TvResult
                        | MovieDetails
                        | TvDetails
                    }
                  />
                  <Text selectable className='font-bold text-2xl mb-1'>
                    {mediaTitle}
                  </Text>
                  <Text className='opacity-50'>{releaseYear}</Text>
                </View>
                <Image
                  className='absolute bottom-1 right-1 rounded-lg w-28 aspect-[10/15] border-2 border-neutral-800/50 drop-shadow-2xl'
                  cachePolicy={"memory-disk"}
                  transition={300}
                  source={{
                    uri: posterSrc,
                  }}
                />
              </View>
              <View>
                <GenreTags genres={details?.genres?.map((g) => g.name) || []} />
              </View>
              {isLoading || isFetching ? (
                <Button
                  loading={true}
                  disabled={true}
                  color='purple'
                  className='mt-4'
                />
              ) : canRequest ? (
                <Button color='purple' onPress={request} className='mt-4'>
                  {t("jellyseerr.request_button")}
                </Button>
              ) : (
                details?.mediaInfo?.jellyfinMediaId && (
                  <View className='flex flex-row space-x-2 mt-4'>
                    {!Platform.isTV && (
                      <Button
                        className='flex-1 bg-yellow-500/50 border-yellow-400 ring-yellow-400 text-yellow-100'
                        color='transparent'
                        onPress={() => bottomSheetModalRef?.current?.present()}
                        iconLeft={
                          <Ionicons
                            name='warning-outline'
                            size={20}
                            color='white'
                          />
                        }
                        style={{
                          borderWidth: 1,
                          borderStyle: "solid",
                        }}
                      >
                        <Text className='text-sm'>
                          {t("jellyseerr.report_issue_button")}
                        </Text>
                      </Button>
                    )}
                    <Button
                      className='flex-1 bg-purple-600/50 border-purple-400 ring-purple-400 text-purple-100'
                      onPress={() => {
                        router.push({
                          pathname:
                            mediaType === MediaType.MOVIE
                              ? "/(auth)/(tabs)/(search)/items/page"
                              : "/(auth)/(tabs)/(search)/series/[id]",
                          params:
                            mediaType === MediaType.MOVIE
                              ? { id: details?.mediaInfo.jellyfinMediaId }
                              : { id: details?.mediaInfo.jellyfinMediaId },
                        });
                      }}
                      iconLeft={
                        <Ionicons name='play-outline' size={20} color='white' />
                      }
                      style={{
                        borderWidth: 1,
                        borderStyle: "solid",
                      }}
                    >
                      <Text className='text-sm'>{t("common.play")}</Text>
                    </Button>
                  </View>
                )
              )}
              {canManageRequests && pendingRequest && (
                <View className='flex flex-col space-y-2 mt-4'>
                  <View className='flex flex-row items-center space-x-2'>
                    <Ionicons name='person-outline' size={16} color='#9CA3AF' />
                    <Text className='text-sm text-neutral-400'>
                      {t("jellyseerr.requested_by", {
                        user:
                          pendingRequest.requestedBy?.displayName ||
                          pendingRequest.requestedBy?.username ||
                          pendingRequest.requestedBy?.jellyfinUsername ||
                          t("jellyseerr.unknown_user"),
                      })}
                    </Text>
                  </View>
                  <View className='flex flex-row space-x-2'>
                    <Button
                      className='flex-1 bg-green-600/50 border-green-400 ring-green-400 text-green-100'
                      color='transparent'
                      onPress={handleApproveRequest}
                      iconLeft={
                        <Ionicons
                          name='checkmark-outline'
                          size={20}
                          color='white'
                        />
                      }
                      style={{
                        borderWidth: 1,
                        borderStyle: "solid",
                      }}
                    >
                      <Text className='text-sm'>{t("jellyseerr.approve")}</Text>
                    </Button>
                    <Button
                      className='flex-1 bg-red-600/50 border-red-400 ring-red-400 text-red-100'
                      color='transparent'
                      onPress={handleDeclineRequest}
                      iconLeft={
                        <Ionicons
                          name='close-outline'
                          size={20}
                          color='white'
                        />
                      }
                      style={{
                        borderWidth: 1,
                        borderStyle: "solid",
                      }}
                    >
                      <Text className='text-sm'>{t("jellyseerr.decline")}</Text>
                    </Button>
                  </View>
                </View>
              )}
              <OverviewText text={result.overview} className='mt-4' />
            </View>

            {mediaType === MediaType.TV && (
              <JellyseerrSeasons
                isLoading={isLoading || isFetching}
                details={details as TvDetails}
                refetch={refetch}
                hasAdvancedRequest={hasAdvancedRequestPermission}
                onAdvancedRequest={(data) => setRequestBody(data)}
              />
            )}
            <DetailFacts
              className='p-2 border border-neutral-800 bg-neutral-900 rounded-xl'
              details={details}
            />
            <Cast details={details} />
          </View>
        </View>
      </ParallaxScrollView>
      <RequestModal
        ref={advancedReqModalRef}
        requestBody={requestBody}
        title={mediaTitle}
        id={result.id!}
        type={mediaType}
        isAnime={isAnime}
        onRequested={() => {
          _setRequestBody(undefined);
          advancedReqModalRef?.current?.close();
          refetch();
        }}
        onDismiss={() => _setRequestBody(undefined)}
      />
      {!Platform.isTV && (
        // This is till it's fixed because the menu isn't selectable on TV
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
          stackBehavior='push'
          onDismiss={handleIssueModalDismiss}
        >
          <BottomSheetView>
            <View className='flex flex-col space-y-4 px-4 pb-8 pt-2'>
              <View>
                <Text className='font-bold text-2xl text-neutral-100'>
                  {t("jellyseerr.whats_wrong")}
                </Text>
              </View>
              <View className='flex flex-col space-y-2 items-start'>
                <View className='flex flex-col w-full'>
                  <Text className='opacity-50 mb-1 text-xs'>
                    {t("jellyseerr.issue_type")}
                  </Text>
                  <PlatformDropdown
                    groups={issueTypeOptionGroups}
                    trigger={
                      <View className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'>
                        <Text numberOfLines={1}>
                          {issueType
                            ? IssueTypeName[issueType]
                            : t("jellyseerr.select_an_issue")}
                        </Text>
                      </View>
                    }
                    title={t("jellyseerr.types")}
                    open={issueTypeDropdownOpen}
                    onOpenChange={setIssueTypeDropdownOpen}
                  />
                </View>

                <View className='p-4 border border-neutral-800 rounded-xl bg-neutral-900 w-full'>
                  <BottomSheetTextInput
                    multiline
                    maxLength={254}
                    style={{ color: "white" }}
                    clearButtonMode='always'
                    placeholder={t("jellyseerr.describe_the_issue")}
                    placeholderTextColor='#9CA3AF'
                    // Issue with multiline + Textinput inside a portal
                    // https://github.com/callstack/react-native-paper/issues/1668
                    defaultValue={issueMessage}
                    onChangeText={setIssueMessage}
                  />
                </View>
              </View>
              <Button className='mt-auto' onPress={submitIssue} color='purple'>
                {t("jellyseerr.submit_button")}
              </Button>
            </View>
          </BottomSheetView>
        </BottomSheetModal>
      )}
    </View>
  );
};

export default Page;
