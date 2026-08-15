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
import { JellyserrRatings } from "@/components/Ratings";
import { TVButton } from "@/components/tv";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { useTVRequestModal } from "@/hooks/useTVRequestModal";
import { useTVSeasonSelectModal } from "@/hooks/useTVSeasonSelectModal";
import { useJellyseerrCanRequest } from "@/utils/_jellyseerr/useJellyseerrCanRequest";
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from "@/utils/jellyseerr/server/constants/media";
import type MediaRequest from "@/utils/jellyseerr/server/entity/MediaRequest";
import type Season from "@/utils/jellyseerr/server/entity/Season";
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Cast card component
interface TVCastCardProps {
  person: {
    id: number;
    name: string;
    character?: string;
    profilePath?: string;
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

export const TVJellyseerrPage: React.FC = () => {
  const typography = useScaledTVTypography();
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

  const { jellyseerrApi, jellyseerrUser, requestMedia } = useJellyseerr();
  const { showRequestModal } = useTVRequestModal();
  const { showSeasonSelectModal } = useTVSeasonSelectModal();

  // Refs for TVFocusGuideView destinations (useState triggers re-render when set)
  const [playButtonRef, setPlayButtonRef] = useState<View | null>(null);
  const [firstCastCardRef, setFirstCastCardRef] = useState<View | null>(null);

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

  // Get seasons with status for TV shows
  const seasons = useMemo(() => {
    if (!details || mediaType !== MediaType.TV) return [];
    const tvDetails = details as TvDetails;
    const mediaInfoSeasons = tvDetails.mediaInfo?.seasons?.filter(
      (s: Season) => s.seasonNumber !== 0,
    );
    const requestedSeasons =
      tvDetails.mediaInfo?.requests?.flatMap((r: MediaRequest) => r.seasons) ??
      [];
    return (
      tvDetails.seasons?.map((season) => ({
        ...season,
        status:
          mediaInfoSeasons?.find(
            (mediaSeason: Season) =>
              mediaSeason.seasonNumber === season.seasonNumber,
          )?.status ??
          requestedSeasons?.find(
            (s: Season) => s.seasonNumber === season.seasonNumber,
          )?.status ??
          MediaStatus.UNKNOWN,
      })) ?? []
    );
  }, [details, mediaType]);

  const _allSeasonsAvailable = useMemo(
    () => seasons.every((season) => season.status === MediaStatus.AVAILABLE),
    [seasons],
  );

  // Check if there are any requestable seasons (status === UNKNOWN)
  const hasRequestableSeasons = useMemo(
    () =>
      seasons.some(
        (season) =>
          season.seasonNumber !== 0 && season.status === MediaStatus.UNKNOWN,
      ),
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
      ? jellyseerrApi?.imageProxy(path, "w1920_and_h800_multi_faces")
      : null;
  }, [details, result.backdropPath, jellyseerrApi]);

  // Poster URL
  const posterUrl = useMemo(() => {
    if (posterSrc) return posterSrc;
    const path = details?.posterPath;
    return path ? jellyseerrApi?.imageProxy(path, "w342") : null;
  }, [posterSrc, details, jellyseerrApi]);

  // Handlers
  const handleApproveRequest = useCallback(async () => {
    if (!pendingRequest?.id) return;
    try {
      await jellyseerrApi?.approveRequest(pendingRequest.id);
      toast.success(t("jellyseerr.toasts.request_approved"));
      refetch();
    } catch (_error) {
      toast.error(t("jellyseerr.toasts.failed_to_approve_request"));
    }
  }, [jellyseerrApi, pendingRequest, refetch, t]);

  const handleDeclineRequest = useCallback(async () => {
    if (!pendingRequest?.id) return;
    try {
      await jellyseerrApi?.declineRequest(pendingRequest.id);
      toast.success(t("jellyseerr.toasts.request_declined"));
      refetch();
    } catch (_error) {
      toast.error(t("jellyseerr.toasts.failed_to_decline_request"));
    }
  }, [jellyseerrApi, pendingRequest, refetch, t]);

  const handleRequest = useCallback(async () => {
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

  const handleRequestAll = useCallback(() => {
    const body: MediaRequestBody = {
      mediaId: Number(result.id!),
      mediaType: MediaType.TV,
      tvdbId: details?.externalIds?.tvdbId,
      seasons: seasons
        .filter((s) => s.status === MediaStatus.UNKNOWN && s.seasonNumber !== 0)
        .map((s) => s.seasonNumber),
    };

    if (hasAdvancedRequestPermission) {
      showRequestModal({
        requestBody: body,
        title: mediaTitle,
        id: result.id!,
        mediaType: MediaType.TV,
        onRequested: refetch,
      });
      return;
    }

    requestMedia(`${mediaTitle}, ${t("jellyseerr.season_all")}`, body, refetch);
  }, [
    details,
    result,
    seasons,
    hasAdvancedRequestPermission,
    requestMedia,
    mediaTitle,
    refetch,
    t,
    showRequestModal,
  ]);

  const handleOpenSeasonSelectModal = useCallback(() => {
    showSeasonSelectModal({
      seasons: seasons.filter((s) => s.seasonNumber !== 0),
      title: mediaTitle,
      mediaId: Number(result.id!),
      tvdbId: details?.externalIds?.tvdbId,
      hasAdvancedRequestPermission,
      onRequested: refetch,
    });
  }, [
    seasons,
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
      router.push(`/(auth)/jellyseerr/person/${personId}` as any);
    },
    [router],
  );

  const hasJellyfinMedia = !!details?.mediaInfo?.jellyfinMediaId;
  const requestedByName =
    pendingRequest?.requestedBy?.displayName ||
    pendingRequest?.requestedBy?.username ||
    pendingRequest?.requestedBy?.jellyfinUsername ||
    t("jellyseerr.unknown_user");

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
              <JellyserrRatings
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
                <GenreTags genres={details.genres.map((g) => g.name)} />
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

              {/* Request button - only show for movies, TV series use Request All + season cards */}
              {canRequest && mediaType === MediaType.MOVIE && (
                <TVButton
                  onPress={handleRequest}
                  variant='secondary'
                  hasTVPreferredFocus={!hasJellyfinMedia}
                  refSetter={!hasJellyfinMedia ? setPlayButtonRef : undefined}
                  scaleAmount={1.01}
                >
                  <Ionicons
                    name='add'
                    size={24}
                    color='#FFFFFF'
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={{
                      fontSize: typography.callout,
                      fontWeight: "bold",
                      color: "#FFFFFF",
                    }}
                  >
                    {t("jellyseerr.request_button")}
                  </Text>
                </TVButton>
              )}

              {/* Request All button for TV series */}
              {mediaType === MediaType.TV &&
                seasons.filter((s) => s.seasonNumber !== 0).length > 0 &&
                hasRequestableSeasons && (
                  <TVButton
                    onPress={handleRequestAll}
                    variant='secondary'
                    hasTVPreferredFocus={!hasJellyfinMedia}
                    refSetter={!hasJellyfinMedia ? setPlayButtonRef : undefined}
                  >
                    <View
                      style={{
                        height: 40,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <Ionicons
                        name='bag-add'
                        size={20}
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
                        {t("jellyseerr.request_all")}
                      </Text>
                    </View>
                  </TVButton>
                )}

              {/* Request Seasons button for TV series */}
              {mediaType === MediaType.TV &&
                seasons.filter((s) => s.seasonNumber !== 0).length > 0 &&
                hasRequestableSeasons && (
                  <TVButton
                    onPress={handleOpenSeasonSelectModal}
                    variant='secondary'
                  >
                    <View
                      style={{
                        height: 40,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <Ionicons
                        name='list'
                        size={20}
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
                        {t("jellyseerr.request_seasons")}
                      </Text>
                    </View>
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
                    {t("jellyseerr.requested_by", { user: requestedByName })}
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
                      {t("jellyseerr.approve")}
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
                      {t("jellyseerr.decline")}
                    </Text>
                  </TVButton>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Cast section */}
        {cast.length > 0 && jellyseerrApi && (
          <View style={{ marginTop: 24 }}>
            <Text
              style={{
                fontSize: typography.heading,
                fontWeight: "bold",
                color: "#FFFFFF",
                marginBottom: 16,
              }}
            >
              {t("jellyseerr.cast")}
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
                    jellyseerrApi.imageProxy(path, size || "w185")
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
