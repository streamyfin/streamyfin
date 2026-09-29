import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type { BottomSheetModalMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useNavigation } from "expo-router";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { Button } from "@/components/Button";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { GenreTags } from "@/components/GenreTags";
import { OverviewText } from "@/components/OverviewText";
import { ParallaxScrollView } from "@/components/ParallaxPage";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { SeerrRatings } from "@/components/Ratings";
import Cast from "@/components/seerr/Cast";
import DetailFacts from "@/components/seerr/DetailFacts";
import RequestModal from "@/components/seerr/RequestModal";
import { TVSeerrPage } from "@/components/seerr/tv";
import SeerrSeasons from "@/components/series/SeerrSeasons";
import { ItemActions } from "@/components/series/SeriesActions";
import { POSTER_ASPECT_RATIO } from "@/constants/Values";
import useRouter from "@/hooks/useAppRouter";
import { useDismissKeyboardOnLeave } from "@/hooks/useDismissKeyboardOnLeave";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrCanRequest } from "@/hooks/useSeerrCanRequest";
import { writeErrorLog } from "@/utils/log";
import { ANIME_KEYWORD_ID } from "@/utils/seerr/data";
import { hasPermission, Permission } from "@/utils/seerr/permissions";
import type {
  MediaRequest,
  MediaRequestBody,
  MovieDetails,
  MovieResult,
  TvDetails,
  TvResult,
} from "@/utils/seerr/types";
import {
  type IssueType,
  IssueTypeName,
  MediaRequestStatus,
  MediaType,
} from "@/utils/seerr/types";

// Mobile page component
const MobilePage: React.FC = () => {
  useDismissKeyboardOnLeave();
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
  const { seerrApi, seerrUser, requestMedia } = useSeerr();

  const [issueType, setIssueType] = useState<IssueType>();
  const [issueMessage, setIssueMessage] = useState<string>();
  const [requestBody, _setRequestBody] = useState<MediaRequestBody>();
  const [issueTypeDropdownOpen, setIssueTypeDropdownOpen] = useState(false);
  const advancedReqModalRef = useRef<BottomSheetModalMethods>(null);
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  const {
    data: details,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    enabled: !!seerrApi && !!result && !!result.id,
    queryKey: ["seerr", "detail", mediaType, result.id],
    staleTime: 0,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    retryOnMount: true,
    refetchInterval: 0,
    queryFn: async () => {
      return mediaType === MediaType.MOVIE
        ? seerrApi?.movieDetails(result.id!)
        : seerrApi?.tvDetails(result.id!);
    },
  });

  const [canRequest, hasAdvancedRequestPermission] =
    useSeerrCanRequest(details);

  const canManageRequests = useMemo(() => {
    if (!seerrUser) return false;
    return hasPermission(Permission.MANAGE_REQUESTS, seerrUser.permissions);
  }, [seerrUser]);

  const pendingRequest = useMemo(() => {
    return details?.mediaInfo?.requests?.find(
      (r: MediaRequest) => r.status === MediaRequestStatus.PENDING,
    );
  }, [details]);

  const handleApproveRequest = useCallback(async () => {
    if (!pendingRequest?.id) return;

    try {
      await seerrApi?.approveRequest(pendingRequest.id);
      toast.success(t("seerr.toasts.request_approved"));
      refetch();
    } catch (error) {
      toast.error(t("seerr.toasts.failed_to_approve_request"));
      console.error("Failed to approve request:", error);
    }
  }, [seerrApi, pendingRequest, refetch, t]);

  const handleDeclineRequest = useCallback(async () => {
    if (!pendingRequest?.id) return;

    try {
      await seerrApi?.declineRequest(pendingRequest.id);
      toast.success(t("seerr.toasts.request_declined"));
      refetch();
    } catch (error) {
      toast.error(t("seerr.toasts.failed_to_decline_request"));
      console.error("Failed to decline request:", error);
    }
  }, [seerrApi, pendingRequest, refetch, t]);

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
    // A title Seerr has never seen carries no mediaInfo, so there is nothing
    // to file an issue against.
    const mediaId = details?.mediaInfo?.id;
    if (result.id && issueType && issueMessage && mediaId !== undefined) {
      seerrApi
        ?.submitIssue(mediaId, Number(issueType), issueMessage)
        .then(() => {
          setIssueType(undefined);
          setIssueMessage(undefined);
          bottomSheetModalRef?.current?.close();
        })
        // The response interceptor already logs and reports the failure with
        // its route; an uncaught rejection here would re-report it as a
        // stackless unhandledrejection event.
        .catch((error) => {
          writeErrorLog("Seerr submitIssue failed", String(error));
        });
    }
  }, [seerrApi, details, result, issueType, issueMessage]);

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
      // TMDB sends null for a show it has no TVDB id for, and the request
      // schema takes a number or nothing.
      tvdbId: details?.externalIds?.tvdbId ?? undefined,
      // A series opens Seerr's season table with nothing chosen yet.
      ...(mediaType === MediaType.TV && { seasons: [] }),
    };

    if (hasAdvancedRequestPermission || mediaType === MediaType.TV) {
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
        title: t("seerr.types"),
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
        headerRight: () => <ItemActions item={details} />,
      });
    }
  }, [details]);

  // Set once the library has the title. Read here rather than in the press
  // handler below, which would lose the check the button was drawn behind.
  const jellyfinMediaId = details?.mediaInfo?.jellyfinMediaId;

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
                  uri: seerrApi?.imageProxy(
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
          {/* As a style: a release build drops the space-y classes. */}
          <View style={{ gap: 16 }}>
            <View className='px-4'>
              <View className='flex flex-row justify-between w-full'>
                <View className='flex flex-col w-56'>
                  <SeerrRatings
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
                  className='absolute bottom-1 right-1 rounded-lg w-28 border-2 border-neutral-800/50 drop-shadow-2xl'
                  // As a style: a release build drops the aspect-[10/15] class
                  // from an image, and the poster came out as a thin bar.
                  style={{ aspectRatio: POSTER_ASPECT_RATIO }}
                  cachePolicy={"memory-disk"}
                  transition={300}
                  source={{
                    uri: posterSrc,
                  }}
                />
              </View>
              <View>
                <GenreTags
                  genres={details?.genres?.flatMap((g) => g.name ?? []) ?? []}
                />
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
                  {t("seerr.request_button")}
                </Button>
              ) : (
                jellyfinMediaId && (
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
                          {t("seerr.report_issue_button")}
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
                          params: { id: jellyfinMediaId },
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
                      {t("seerr.requested_by", {
                        user:
                          pendingRequest.requestedBy?.displayName ||
                          pendingRequest.requestedBy?.username ||
                          pendingRequest.requestedBy?.jellyfinUsername ||
                          t("seerr.unknown_user"),
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
                      <Text className='text-sm'>{t("seerr.approve")}</Text>
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
                      <Text className='text-sm'>{t("seerr.decline")}</Text>
                    </Button>
                  </View>
                </View>
              )}
              <OverviewText text={result.overview} className='mt-4' />
            </View>

            {mediaType === MediaType.TV && (
              <SeerrSeasons
                isLoading={isLoading || isFetching}
                details={details as TvDetails}
                refetch={refetch}
                hasAdvancedRequest={hasAdvancedRequestPermission}
                onAdvancedRequest={(data) => setRequestBody(data)}
              />
            )}
            <DetailFacts
              // The rows give the vertical rhythm, the box only the sides.
              className='px-3 border border-neutral-800 bg-neutral-900 rounded-xl'
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
        details={
          mediaType === MediaType.TV ? (details as TvDetails) : undefined
        }
        advanced={hasAdvancedRequestPermission}
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
                  {t("seerr.whats_wrong")}
                </Text>
              </View>
              <View className='flex flex-col space-y-2 items-start'>
                <View className='flex flex-col w-full'>
                  <Text className='opacity-50 mb-1 text-xs'>
                    {t("seerr.issue_type")}
                  </Text>
                  <PlatformDropdown
                    groups={issueTypeOptionGroups}
                    trigger={
                      <View className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'>
                        <Text numberOfLines={1}>
                          {issueType
                            ? IssueTypeName[issueType]
                            : t("seerr.select_an_issue")}
                        </Text>
                      </View>
                    }
                    title={t("seerr.types")}
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
                    placeholder={t("seerr.describe_the_issue")}
                    placeholderTextColor='#9CA3AF'
                    // Issue with multiline + Textinput inside a portal
                    // https://github.com/callstack/react-native-paper/issues/1668
                    defaultValue={issueMessage}
                    onChangeText={setIssueMessage}
                  />
                </View>
              </View>
              <Button className='mt-auto' onPress={submitIssue} color='purple'>
                {t("seerr.submit_button")}
              </Button>
            </View>
          </BottomSheetView>
        </BottomSheetModal>
      )}
    </View>
  );
};

// Platform-conditional page component
const Page: React.FC = () => {
  if (Platform.isTV) {
    return <TVSeerrPage />;
  }
  return <MobilePage />;
};

export default Page;
