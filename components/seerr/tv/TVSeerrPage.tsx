import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  TVFocusGuideView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { GenreTags } from "@/components/GenreTags";
import { Loader } from "@/components/Loader";
import { SeerrRatings } from "@/components/Ratings";
import { SeerrRequestIcon } from "@/components/seerr/SeerrRequestIcon";
import { TVButton } from "@/components/tv";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { SeerrIssueColors } from "@/constants/Colors";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrCanRequest } from "@/hooks/useSeerrCanRequest";
import { useSeerrPublicSettings } from "@/hooks/useSeerrPublicSettings";
import { useTVIssueModal } from "@/hooks/useTVIssueModal";
import { useTVRequestModal } from "@/hooks/useTVRequestModal";
import { useTVSeasonSelectModal } from "@/hooks/useTVSeasonSelectModal";
import { hasPermission, Permission } from "@/utils/seerr/permissions";
import { canRequestMore } from "@/utils/seerr/requests";
import { seasonsWithStatus } from "@/utils/seerr/seasons";
import type {
  MediaRequest,
  MediaRequestBody,
  MovieDetails,
  MovieResult,
  TvDetails,
  TvResult,
} from "@/utils/seerr/types";
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from "@/utils/seerr/types";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Cast card component
interface TVCastCardProps {
  person: {
    id: number;
    name: string;
    character?: string;
    profilePath?: string | null;
  };
  imageProxy: (path: string, size?: string) => string;
  onPress: () => void;
  refSetter?: (ref: View | null) => void;
}

const TVCastCard: React.FC<TVCastCardProps> = ({
  person,
  imageProxy,
  onPress,
  refSetter,
}) => {
  const typography = useScaledTVTypography();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.08 });

  const profileUrl = person.profilePath
    ? imageProxy(person.profilePath, "w185")
    : null;

  return (
    <Pressable
      ref={refSetter}
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            width: 140,
            alignItems: "center",
            shadowColor: "#fff",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.4 : 0,
            shadowRadius: focused ? 12 : 0,
          },
        ]}
      >
        <View
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            overflow: "hidden",
            backgroundColor: "rgba(255,255,255,0.1)",
            marginBottom: 12,
            borderWidth: focused ? 3 : 0,
            borderColor: "#fff",
          }}
        >
          {profileUrl ? (
            <Image
              source={{ uri: profileUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit='cover'
              cachePolicy='memory-disk'
            />
          ) : (
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name='person' size={48} color='rgba(255,255,255,0.4)' />
            </View>
          )}
        </View>
        <Text
          style={{
            fontSize: typography.callout,
            color: focused ? "#fff" : "rgba(255,255,255,0.9)",
            fontWeight: "600",
            textAlign: "center",
          }}
          numberOfLines={2}
        >
          {person.name}
        </Text>
        {person.character && (
          <Text
            style={{
              fontSize: 14,
              color: focused
                ? "rgba(255,255,255,0.7)"
                : "rgba(255,255,255,0.5)",
              textAlign: "center",
              marginTop: 4,
            }}
            numberOfLines={1}
          >
            {person.character}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
};

export const TVSeerrPage: React.FC = () => {
  const typography = useScaledTVTypography();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { t } = useTranslation();
  const router = useRouter();

  const {
    mediaTitle: titleParam,
    releaseYear: yearParam,
    posterSrc,
    mediaType,
    ...result
  } = params as unknown as {
    mediaTitle: string;
    releaseYear: number;
    canRequest: string;
    posterSrc: string;
    mediaType: MediaType;
  } & Partial<MovieResult | TvResult | MovieDetails | TvDetails>;

  const {
    seerrApi,
    seerrUser,
    requestMedia,
    refreshAfterRequest,
    getTitle,
    getYear,
  } = useSeerr();
  const { showRequestModal } = useTVRequestModal();
  const { showSeasonSelectModal } = useTVSeasonSelectModal();
  const { showIssueModal } = useTVIssueModal();

  // Refs for TVFocusGuideView destinations (useState triggers re-render when set)
  const [playButtonRef, setPlayButtonRef] = useState<View | null>(null);
  const [firstCastCardRef, setFirstCastCardRef] = useState<View | null>(null);

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
    queryFn: async () => {
      return mediaType === MediaType.MOVIE
        ? seerrApi?.movieDetails(result.id!)
        : seerrApi?.tvDetails(result.id!);
    },
  });

  // The title and year come with the route from search, not from Discover's
  // rows: Seerr's details give them either way.
  const mediaTitle = getTitle(details) || titleParam;
  const releaseYear = getYear(details) || yearParam;

  const [canRequest, hasAdvancedRequestPermission] =
    useSeerrCanRequest(details);
  // Seerr's "Request more", as the phone offers it: a series it knows with
  // seasons still to ask for.
  const publicSettings = useSeerrPublicSettings();
  const specials = publicSettings?.enableSpecialEpisodes === true;
  const requestMore =
    mediaType === MediaType.TV &&
    canRequestMore(details as TvDetails, seerrUser?.permissions ?? 0, {
      specials,
    });
  const offersRequest = canRequest || requestMore;

  const canManageRequests = useMemo(() => {
    if (!seerrUser) return false;
    return hasPermission(Permission.MANAGE_REQUESTS, seerrUser.permissions);
  }, [seerrUser]);

  const pendingRequest = useMemo(() => {
    return details?.mediaInfo?.requests?.find(
      (r: MediaRequest) => r.status === MediaRequestStatus.PENDING,
    );
  }, [details]);

  // Get seasons with status for TV shows
  const seasons = useMemo(
    () =>
      details && mediaType === MediaType.TV
        ? seasonsWithStatus(details as TvDetails)
        : [],
    [details, mediaType],
  );

  const _allSeasonsAvailable = useMemo(
    () => seasons.every((season) => season.status === MediaStatus.AVAILABLE),
    [seasons],
  );

  // Get cast
  const cast = useMemo(() => {
    return details?.credits?.cast?.slice(0, 10) ?? [];
  }, [details]);

  // Backdrop URL
  const backdropUrl = useMemo(() => {
    const path = details?.backdropPath || result.backdropPath;
    return path
      ? seerrApi?.imageProxy(path, "w1920_and_h800_multi_faces")
      : null;
  }, [details, result.backdropPath, seerrApi]);

  // Poster URL
  const posterUrl = useMemo(() => {
    if (posterSrc) return posterSrc;
    const path = details?.posterPath;
    return path ? seerrApi?.imageProxy(path, "w342") : null;
  }, [posterSrc, details, seerrApi]);

  // Handlers
  const handleApproveRequest = useCallback(async () => {
    if (!pendingRequest?.id) return;
    try {
      await seerrApi?.approveRequest(pendingRequest.id);
      toast.success(t("seerr.toasts.request_approved"));
      refetch();
      refreshAfterRequest();
    } catch (_error) {
      toast.error(t("seerr.toasts.failed_to_approve_request"));
    }
  }, [seerrApi, pendingRequest, refetch, refreshAfterRequest, t]);

  const handleDeclineRequest = useCallback(async () => {
    if (!pendingRequest?.id) return;
    try {
      await seerrApi?.declineRequest(pendingRequest.id);
      toast.success(t("seerr.toasts.request_declined"));
      refetch();
      refreshAfterRequest();
    } catch (_error) {
      toast.error(t("seerr.toasts.failed_to_decline_request"));
    }
  }, [seerrApi, pendingRequest, refetch, refreshAfterRequest, t]);

  const handleRequest = useCallback(async () => {
    const body: MediaRequestBody = {
      mediaId: Number(result.id!),
      mediaType: mediaType!,
      tvdbId: details?.externalIds?.tvdbId ?? undefined,
      ...(mediaType === MediaType.TV && {
        seasons: (details as TvDetails)?.seasons
          ?.filter?.((s) => s.seasonNumber !== 0)
          ?.map?.((s) => s.seasonNumber),
      }),
    };

    if (hasAdvancedRequestPermission) {
      showRequestModal({
        requestBody: body,
        title: mediaTitle,
        id: result.id!,
        mediaType: mediaType!,
        onRequested: refetch,
      });
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
    showRequestModal,
  ]);

  const handleOpenSeasonSelectModal = useCallback(() => {
    showSeasonSelectModal({
      // Specials only where the server shows them, as on the phone.
      seasons: seasons.filter((s) => specials || s.seasonNumber !== 0),
      title: mediaTitle,
      mediaId: Number(result.id!),
      tvdbId: details?.externalIds?.tvdbId ?? undefined,
      hasAdvancedRequestPermission,
      onRequested: refetch,
    });
  }, [
    seasons,
    specials,
    mediaTitle,
    result,
    details,
    hasAdvancedRequestPermission,
    refetch,
    showSeasonSelectModal,
  ]);

  const handlePlay = useCallback(() => {
    const jellyfinMediaId = details?.mediaInfo?.jellyfinMediaId;
    if (!jellyfinMediaId) return;
    router.push({
      pathname:
        mediaType === MediaType.MOVIE
          ? "/(auth)/(tabs)/(search)/items/page"
          : "/(auth)/(tabs)/(search)/series/[id]",
      params: { id: jellyfinMediaId },
    });
  }, [details, mediaType, router]);

  const handleCastPress = useCallback(
    (personId: number) => {
      router.push(`/(auth)/seerr/person/${personId}` as any);
    },
    [router],
  );

  const hasJellyfinMedia = !!details?.mediaInfo?.jellyfinMediaId;
  const requestedByName =
    pendingRequest?.requestedBy?.displayName ||
    pendingRequest?.requestedBy?.username ||
    pendingRequest?.requestedBy?.jellyfinUsername ||
    t("seerr.unknown_user");

  if (isLoading || isFetching) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#000",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Loader />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* Full-screen backdrop */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        {backdropUrl ? (
          <Image
            source={{ uri: backdropUrl }}
            style={{ width: "100%", height: "100%" }}
            contentFit='cover'
            cachePolicy='memory-disk'
            transition={300}
          />
        ) : (
          <View style={{ flex: 1, backgroundColor: "#1a1a1a" }} />
        )}
        {/* Bottom gradient */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.7)", "rgba(0,0,0,0.95)"]}
          locations={[0, 0.5, 1]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "70%",
          }}
        />
        {/* Left gradient */}
        <LinearGradient
          colors={["rgba(0,0,0,0.8)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.6, y: 0 }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "60%",
          }}
        />
      </View>

      {/* Main content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 140,
          paddingBottom: insets.bottom + 60,
          paddingHorizontal: insets.left + 80,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top section - Poster + Content */}
        <View
          style={{
            flexDirection: "row",
            minHeight: SCREEN_HEIGHT * 0.45,
          }}
        >
          {/* Left side - Poster */}
          <View
            style={{
              width: SCREEN_WIDTH * 0.22,
              marginRight: 50,
            }}
          >
            <View
              style={{
                aspectRatio: 2 / 3,
                borderRadius: 16,
                overflow: "hidden",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.5,
                shadowRadius: 20,
              }}
            >
              {posterUrl ? (
                <Image
                  source={{ uri: posterUrl }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit='cover'
                  cachePolicy='memory-disk'
                />
              ) : (
                <View
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(255,255,255,0.1)",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons
                    name='image-outline'
                    size={48}
                    color='rgba(255,255,255,0.3)'
                  />
                </View>
              )}
            </View>
          </View>

          {/* Right side - Content */}
          <View style={{ flex: 1, justifyContent: "center" }}>
            {/* Ratings */}
            {details && (
              <SeerrRatings
                result={
                  details as MovieDetails | TvDetails | MovieResult | TvResult
                }
              />
            )}

            {/* Title */}
            <Text
              style={{
                fontSize: typography.display,
                fontWeight: "bold",
                color: "#FFFFFF",
                marginTop: 8,
                marginBottom: 12,
              }}
              numberOfLines={2}
            >
              {mediaTitle}
            </Text>

            {/* Year */}
            <Text
              style={{
                fontSize: typography.body,
                color: "rgba(255,255,255,0.7)",
                marginBottom: 16,
              }}
            >
              {releaseYear}
            </Text>

            {/* Genres */}
            {details?.genres && details.genres.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <GenreTags
                  genres={details.genres.flatMap((g) => g.name ?? [])}
                />
              </View>
            )}

            {/* Overview */}
            {(details?.overview || result.overview) && (
              <BlurView
                intensity={10}
                tint='light'
                style={{
                  borderRadius: 8,
                  overflow: "hidden",
                  maxWidth: SCREEN_WIDTH * 0.45,
                  marginBottom: 32,
                }}
              >
                <View
                  style={{
                    padding: 16,
                    backgroundColor: "rgba(0,0,0,0.3)",
                  }}
                >
                  <Text
                    style={{
                      fontSize: typography.body,
                      color: "#E5E7EB",
                      lineHeight: 32,
                    }}
                    numberOfLines={4}
                  >
                    {details?.overview || result.overview}
                  </Text>
                </View>
              </BlurView>
            )}

            {/* Action buttons */}
            <View
              style={{
                flexDirection: "row",
                gap: 16,
                marginBottom: 24,
              }}
            >
              {hasJellyfinMedia && (
                <TVButton
                  onPress={handlePlay}
                  hasTVPreferredFocus
                  variant='primary'
                  refSetter={setPlayButtonRef}
                >
                  <Ionicons
                    name='play'
                    size={28}
                    color='#000000'
                    style={{ marginRight: 10 }}
                  />
                  <Text
                    style={{
                      fontSize: typography.callout,
                      fontWeight: "bold",
                      color: "#000000",
                    }}
                  >
                    {t("common.play")}
                  </Text>
                </TVButton>
              )}

              {/* Seerr's one request button (RequestButton), as on the phone:
                  a series picks its seasons in the season sheet. */}
              {offersRequest && (
                <TVButton
                  onPress={
                    mediaType === MediaType.TV
                      ? handleOpenSeasonSelectModal
                      : handleRequest
                  }
                  variant='secondary'
                  hasTVPreferredFocus={!hasJellyfinMedia}
                  refSetter={!hasJellyfinMedia ? setPlayButtonRef : undefined}
                  scaleAmount={1.01}
                >
                  <View style={{ marginRight: 8 }}>
                    <SeerrRequestIcon size={24} color='#FFFFFF' />
                  </View>
                  <Text
                    style={{
                      fontSize: typography.callout,
                      fontWeight: "bold",
                      color: "#FFFFFF",
                    }}
                  >
                    {requestMore
                      ? t("seerr.request_more")
                      : t("seerr.request_button")}
                  </Text>
                </TVButton>
              )}

              {/* Report an issue, as the phone's icon beside the buttons. */}
              {hasJellyfinMedia && details?.mediaInfo?.id !== undefined && (
                <TVButton
                  square
                  variant='secondary'
                  onPress={() =>
                    showIssueModal({
                      title: mediaTitle,
                      mediaId: details.mediaInfo!.id,
                    })
                  }
                  style={{
                    backgroundColor: SeerrIssueColors.background,
                    borderWidth: 1,
                    borderColor: SeerrIssueColors.border,
                  }}
                >
                  <Ionicons name='warning-outline' size={24} color='#FFFFFF' />
                </TVButton>
              )}
            </View>

            {/* Approve/Decline for managers */}
            {canManageRequests && pendingRequest && (
              <View style={{ marginBottom: 24 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <Ionicons name='person-outline' size={18} color='#9CA3AF' />
                  <Text
                    style={{
                      fontSize: typography.callout,
                      color: "#9CA3AF",
                      marginLeft: 8,
                    }}
                  >
                    {t("seerr.requested_by", { user: requestedByName })}
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 16 }}>
                  <TVButton onPress={handleApproveRequest} variant='secondary'>
                    <Ionicons
                      name='checkmark'
                      size={22}
                      color='#FFFFFF'
                      style={{ marginRight: 8 }}
                    />
                    <Text
                      style={{
                        fontSize: typography.callout,
                        fontWeight: "600",
                        color: "#FFFFFF",
                      }}
                    >
                      {t("seerr.approve")}
                    </Text>
                  </TVButton>

                  <TVButton onPress={handleDeclineRequest} variant='secondary'>
                    <Ionicons
                      name='close'
                      size={22}
                      color='#FFFFFF'
                      style={{ marginRight: 8 }}
                    />
                    <Text
                      style={{
                        fontSize: typography.callout,
                        fontWeight: "600",
                        color: "#FFFFFF",
                      }}
                    >
                      {t("seerr.decline")}
                    </Text>
                  </TVButton>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Cast section */}
        {cast.length > 0 && seerrApi && (
          <View style={{ marginTop: 24 }}>
            <Text
              style={{
                fontSize: typography.heading,
                fontWeight: "bold",
                color: "#FFFFFF",
                marginBottom: 16,
              }}
            >
              {t("seerr.cast")}
            </Text>

            {/* Focus guides for bidirectional navigation - stacked together */}
            {/* Downward: action buttons → first cast card */}
            {firstCastCardRef && (
              <TVFocusGuideView
                destinations={[firstCastCardRef]}
                style={{
                  height: 1,
                  width: SCREEN_WIDTH,
                  marginLeft: -(insets.left + 80),
                }}
              />
            )}
            {/* Upward: cast → action buttons */}
            {playButtonRef && (
              <TVFocusGuideView
                destinations={[playButtonRef]}
                style={{
                  height: 1,
                  width: SCREEN_WIDTH,
                  marginLeft: -(insets.left + 80),
                }}
              />
            )}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ overflow: "visible" }}
              contentContainerStyle={{
                paddingVertical: 16,
                gap: 28,
              }}
            >
              {cast.map((person, index) => (
                <TVCastCard
                  key={person.id}
                  person={person}
                  imageProxy={(path, size) =>
                    seerrApi.imageProxy(path, size || "w185")
                  }
                  onPress={() => handleCastPress(person.id)}
                  refSetter={index === 0 ? setFirstCastCardRef : undefined}
                />
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </View>
  );
};
