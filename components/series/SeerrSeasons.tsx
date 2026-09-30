import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import {
  type QueryObserverResult,
  type RefetchOptions,
  useQuery,
} from "@tanstack/react-query";
import { useHeaderHeight } from "expo-router/react-navigation";
import { t } from "i18next";
import { orderBy } from "lodash";
import type React from "react";
import { useCallback, useContext, useMemo, useState } from "react";
import { Alert, TouchableOpacity, View } from "react-native";
import Animated, {
  measure,
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
} from "react-native-reanimated";
import { scheduleOnUI } from "react-native-worklets";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { ParallaxScrollContext } from "@/components/ParallaxPage";
import { RoundButton } from "@/components/RoundButton";
import SeerrStatusIcon from "@/components/seerr/SeerrStatusIcon";
import { SheetColors } from "@/constants/Colors";
import { SEERR_SEASON_HEADER_HEIGHT } from "@/constants/Seerr";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrPublicSettings } from "@/hooks/useSeerrPublicSettings";
import { formatSeerrDate, seerrLocaleTag } from "@/utils/seerr/dates";
import { episodeStillUrl } from "@/utils/seerr/images";
import { seasonsWithStatus, unrequestedSeasons } from "@/utils/seerr/seasons";
import type {
  MediaRequestBody,
  MovieDetails,
  SeasonWithEpisodes,
  TvDetails,
} from "@/utils/seerr/types";
import { MediaType } from "@/utils/seerr/types";
import { stickyHeaderOffset } from "@/utils/stickyHeader";
import { Loader } from "../Loader";

type Episode = NonNullable<SeasonWithEpisodes["episodes"]>[number];

// The header of an open season while it is not pinned: one object, so the
// style is not sent again on every frame of the scroll.
const AT_REST = { transform: [{ translateY: 0 }] };

/**
 * A season's episodes, one under the other as on Seerr's site: the still, the
 * number and title, the air date, and the whole overview.
 */
const SeasonEpisodes: React.FC<{
  details: TvDetails;
  seasonNumber: number;
}> = ({ details, seasonNumber }) => {
  const { seerrApi, seerrRegion: region, seerrLocale: locale } = useSeerr();

  const { data: seasonWithEpisodes, isLoading } = useQuery({
    queryKey: ["seerr", details.id, "season", seasonNumber],
    queryFn: async () => seerrApi?.tvSeason(details.id, seasonNumber),
    // Not before the Seerr client exists, or the query answers undefined.
    enabled:
      !!seerrApi &&
      details.seasons.filter((s) => s.seasonNumber !== 0).length > 0,
  });

  if (isLoading) return <Loader />;

  const baseUrl = seerrApi?.axios.defaults.baseURL ?? "";
  const tag = seerrLocaleTag(locale, region);

  return (
    <View style={{ paddingHorizontal: 16 }}>
      {(seasonWithEpisodes?.episodes ?? []).map((episode, index) => (
        <View key={episode.id}>
          {index > 0 && (
            <View
              style={{ height: 1, backgroundColor: SheetColors.separator }}
            />
          )}
          <EpisodeRow
            episode={episode}
            still={episodeStillUrl(baseUrl, episode.stillPath)}
            airDate={formatSeerrDate(episode.airDate, tag)}
          />
        </View>
      ))}
    </View>
  );
};

const EpisodeRow: React.FC<{
  episode: Episode;
  still?: string;
  airDate?: string;
}> = ({ episode, still, airDate }) => {
  const [imageError, setImageError] = useState(false);

  return (
    <View style={{ paddingVertical: 12, gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View
          style={{
            width: 128,
            aspectRatio: 16 / 9,
            borderRadius: 8,
            overflow: "hidden",
            backgroundColor: SheetColors.group,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {still && !imageError ? (
            <Image
              source={{ uri: still }}
              cachePolicy='memory-disk'
              contentFit='cover'
              style={{ width: "100%", height: "100%" }}
              onError={() => setImageError(true)}
            />
          ) : (
            <Ionicons
              name='image-outline'
              size={22}
              color='white'
              style={{ opacity: 0.4 }}
            />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "600" }} numberOfLines={2}>
            {`${episode.episodeNumber}. ${episode.name}`}
          </Text>
          {airDate && (
            <Text
              style={{
                fontSize: 13,
                marginTop: 2,
                color: SheetColors.secondaryText,
              }}
            >
              {airDate}
            </Text>
          )}
        </View>
      </View>
      {!!episode.overview && (
        <Text
          style={{
            fontSize: 13,
            lineHeight: 18,
            color: SheetColors.secondaryText,
          }}
        >
          {episode.overview}
        </Text>
      )}
    </View>
  );
};

/** The row that opens or closes a season. */
const SeasonToggle: React.FC<{
  open: boolean;
  onPress: () => void;
  children: React.ReactNode;
}> = ({ open, onPress, children }) => (
  <TouchableOpacity
    onPress={onPress}
    accessibilityState={{ expanded: open }}
    style={{ paddingHorizontal: 16 }}
  >
    {children}
  </TouchableOpacity>
);

/**
 * An open season: its header, then its episodes. While they scroll past, the
 * header slides down with them and stays under the navigation bar, so the
 * season can be closed without scrolling back up; it stops at the season's
 * last episode. Closing it from there brings the season's top back under the
 * bar, where the header was, rather than leaving the page far below it.
 */
const OpenSeason: React.FC<{
  header: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ header, onClose, children }) => {
  const page = useContext(ParallaxScrollContext);
  const scroll = page?.offset;
  const scrollView = page?.view;
  const origin = page?.origin;
  const top = useHeaderHeight();
  const blockRef = useAnimatedRef<Animated.View>();

  // How far the header is pushed down, read from the layout: the season and
  // the top of the content are measured together, so the scroll position the
  // layout holds, which trails the one the page is drawn at, cancels out, and
  // the live position comes from the scroll alone.
  const pushed = (scrolled: number) => {
    "worklet";
    if (!scrollView || !origin) return 0;
    const view = measure(scrollView);
    const content = measure(origin);
    const block = measure(blockRef);
    if (!view || !content || !block) return 0;
    return stickyHeaderOffset({
      viewTop: view.pageY,
      sectionOffset: block.pageY - content.pageY,
      sectionHeight: block.height,
      headerHeight: SEERR_SEASON_HEADER_HEIGHT,
      scroll: scrolled,
      top,
    });
  };

  const headerStyle = useAnimatedStyle(() => {
    if (!scroll) return AT_REST;
    const offset = pushed(scroll.value);
    return offset === 0 ? AT_REST : { transform: [{ translateY: offset }] };
  });

  const close = () => {
    if (scroll && scrollView) {
      scheduleOnUI(() => {
        "worklet";
        const offset = pushed(scroll.value);
        if (offset > 0) scrollTo(scrollView, 0, scroll.value - offset, false);
      });
    }
    onClose();
  };

  return (
    <Animated.View ref={blockRef}>
      <Animated.View style={[{ zIndex: 10 }, headerStyle]}>
        <SeasonToggle open onPress={close}>
          {header}
        </SeasonToggle>
      </Animated.View>
      {children}
    </Animated.View>
  );
};

const SeerrSeasons: React.FC<{
  isLoading: boolean;
  details?: TvDetails;
  hasAdvancedRequest?: boolean;
  onAdvancedRequest?: (data: MediaRequestBody) => void;
  refetch: (
    options?: RefetchOptions | undefined,
  ) => Promise<
    QueryObserverResult<TvDetails | MovieDetails | undefined, Error>
  >;
}> = ({
  isLoading,
  details,
  refetch,
  hasAdvancedRequest,
  onAdvancedRequest,
}) => {
  const { seerrApi, requestMedia } = useSeerr();
  const [seasonStates, setSeasonStates] = useState<{ [key: number]: boolean }>(
    {},
  );
  const seasons = useMemo(
    () => (details ? seasonsWithStatus(details) : []),
    [details],
  );
  // What Seerr's own modal reads from the server: the specials, and whether
  // a series can be requested a season at a time.
  const publicSettings = useSeerrPublicSettings();
  const specials = publicSettings?.enableSpecialEpisodes === true;
  const partial = publicSettings?.partialRequestsEnabled !== false;

  // Which seasons can still be asked for, by Seerr's own rules.
  const unrequested = useMemo(
    () => (details ? unrequestedSeasons(details, { specials }) : []),
    [details, specials],
  );

  const requestAll = useCallback(() => {
    if (details && seerrApi) {
      const body: MediaRequestBody = {
        mediaId: details.id,
        mediaType: MediaType.TV,
        tvdbId: details.externalIds?.tvdbId ?? undefined,
        seasons: unrequested,
      };
      if (hasAdvancedRequest) {
        return onAdvancedRequest?.(body);
      }
      requestMedia(details.name, body, refetch);
    }
  }, [
    seerrApi,
    unrequested,
    details,
    hasAdvancedRequest,
    onAdvancedRequest,
    requestMedia,
    refetch,
  ]);

  const promptRequestAll = useCallback(
    () =>
      Alert.alert(
        t("seerr.confirm"),
        t("seerr.are_you_sure_you_want_to_request_all_seasons"),
        [
          {
            text: t("seerr.cancel"),
            style: "cancel",
          },
          {
            text: t("seerr.yes"),
            onPress: requestAll,
          },
        ],
      ),
    [requestAll],
  );

  const requestSeason = useCallback(
    async (canRequest: boolean, seasonNumber: number) => {
      if (canRequest && details) {
        const body: MediaRequestBody = {
          mediaId: details.id,
          mediaType: MediaType.TV,
          tvdbId: details.externalIds?.tvdbId ?? undefined,
          seasons: [seasonNumber],
        };
        if (hasAdvancedRequest) {
          return onAdvancedRequest?.(body);
        }
        requestMedia(`${details.name}, Season ${seasonNumber}`, body, refetch);
      }
    },
    [requestMedia, hasAdvancedRequest, onAdvancedRequest, refetch, details],
  );

  if (!details) return null;

  if (isLoading)
    return (
      <View>
        <View className='flex flex-row justify-between items-end px-4'>
          <Text className='text-lg font-bold mb-2'>
            {t("item_card.seasons")}
          </Text>
          {unrequested.length > 0 && (
            <RoundButton className='mb-2 pa-2' onPress={promptRequestAll}>
              <Ionicons name='bag-add' color='white' size={26} />
            </RoundButton>
          )}
        </View>
        <Loader />
      </View>
    );

  return (
    <FlashList
      data={orderBy(
        // The specials only when the server shows them, and only with episodes.
        seasons.filter(
          (s) => s.seasonNumber !== 0 || (specials && s.episodeCount !== 0),
        ),
        "seasonNumber",
        "desc",
      )}
      ListHeaderComponent={() => (
        <View className='flex flex-row justify-between items-end px-4'>
          <Text className='text-lg font-bold mb-2'>
            {t("item_card.seasons")}
          </Text>
          {unrequested.length > 0 && (
            <RoundButton className='mb-2 pa-2' onPress={promptRequestAll}>
              <Ionicons name='bag-add' color='white' size={26} />
            </RoundButton>
          )}
        </View>
      )}
      ItemSeparatorComponent={() => <View className='h-2' />}
      renderItem={({ item: season }) => {
        const open = !!seasonStates?.[season.seasonNumber];
        // One season at a time only where the server takes it.
        const canRequest = partial && unrequested.includes(season.seasonNumber);
        const toggle = () =>
          setSeasonStates((prevState) => ({
            ...prevState,
            [season.seasonNumber]: !prevState?.[season.seasonNumber],
          }));
        const header = (
          <View
            style={{
              height: SEERR_SEASON_HEADER_HEIGHT,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              borderRadius: 12,
              // Opaque, so the episodes it passes over do not show through.
              backgroundColor: SheetColors.group,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                flex: 1,
              }}
            >
              <Ionicons
                name={open ? "chevron-down" : "chevron-forward"}
                size={16}
                color={SheetColors.secondaryText}
              />
              {/* Text rather than tags: the iOS glass behind a tag
                  vanished once the list reloaded after a request. */}
              <Text
                style={{ fontSize: 16, fontWeight: "600" }}
                numberOfLines={1}
              >
                {season.seasonNumber === 0
                  ? t("seerr.specials")
                  : t("seerr.season_number", {
                      season_number: season.seasonNumber,
                    })}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: SheetColors.secondaryText,
                }}
              >
                {t("seerr.number_episodes", {
                  count: season.episodeCount,
                  episode_number: season.episodeCount,
                })}
              </Text>
            </View>
            <SeerrStatusIcon
              onPress={() => requestSeason(canRequest, season.seasonNumber)}
              className={canRequest ? "bg-gray-700/40" : undefined}
              mediaStatus={season.status}
              showRequestIcon={canRequest}
            />
          </View>
        );
        // Only an open season follows the scroll.
        return open ? (
          <OpenSeason header={header} onClose={toggle}>
            <SeasonEpisodes
              details={details}
              seasonNumber={season.seasonNumber}
            />
          </OpenSeason>
        ) : (
          <SeasonToggle open={false} onPress={toggle}>
            {header}
          </SeasonToggle>
        );
      }}
    />
  );
};

export default SeerrSeasons;
