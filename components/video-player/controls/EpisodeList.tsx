import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { atom, useAtom } from "jotai";
import { useEffect, useMemo } from "react";
import { TouchableOpacity, View } from "react-native";
import { buildItemCards, type CardData } from "@/components/cards/CardData";
import { CardRow } from "@/components/cards/CardRow";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import {
  SeasonDropdown,
  type SeasonIndexState,
} from "@/components/series/SeasonDropdown";
import { useControlsSafeAreaInsets } from "@/hooks/useControlsSafeAreaInsets";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import {
  getDownloadedEpisodesForSeason,
  getDownloadedSeasonNumbers,
} from "@/utils/downloads/offline-series";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { runtimeTicksToSeconds } from "@/utils/time";
import { HEADER_LAYOUT, ICON_SIZES } from "./constants";

type Props = {
  item: BaseItemDto;
  close: () => void;
  goToItem: (item: BaseItemDto) => void;
};

export const seasonIndexAtom = atom<SeasonIndexState>({});

/**
 * Room under each card for the title, the S:E line, the runtime and up to
 * seven lines of overview. The row reserves it; it cannot measure a slot.
 */
const FOOTER_HEIGHT = 190;

export const EpisodeList: React.FC<Props> = ({ item, close, goToItem }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [seasonIndexState, setSeasonIndexState] = useAtom(seasonIndexAtom);
  const isOffline = useOfflineMode();
  const insets = useControlsSafeAreaInsets();

  // Set the initial season index
  useEffect(() => {
    if (item.SeriesId) {
      setSeasonIndexState((prev) => ({
        ...prev,
        [item.ParentId ?? ""]: item.ParentIndexNumber ?? 0,
      }));
    }
  }, []);

  // Read the live (cached) downloads DB inside the query rather than the
  // provider's downloadedItems snapshot. The snapshot only refreshes on the
  // provider refreshKey, so after updateDownloadedItem() invalidates
  // ["episodes"]/["seasons"] (e.g. progress/played writes) the refetch would
  // return stale data. getAllDownloadedItems() is cached, so this stays cheap.
  const { getDownloadedItems } = useDownload();

  const seasonIndex = seasonIndexState[item.ParentId ?? ""];

  const { data: seasons } = useQuery({
    queryKey: ["seasons", item.SeriesId],
    queryFn: async () => {
      if (isOffline) {
        if (!item.SeriesId) return [];
        const seasonNumbers = getDownloadedSeasonNumbers(
          getDownloadedItems(),
          item.SeriesId,
        );
        // Create fake season objects
        return seasonNumbers.map((seasonNumber) => ({
          Id: seasonNumber?.toString(),
          IndexNumber: seasonNumber,
          Name: `Season ${seasonNumber}`,
          SeriesId: item.SeriesId,
        }));
      }

      if (!api || !user?.Id || !item.SeriesId) return [];
      const response = await getTvShowsApi(api).getSeasons({
        seriesId: item.SeriesId,
        userId: user.Id,
        fields: [
          "ItemCounts",
          "PrimaryImageAspectRatio",
          "CanDelete",
          "MediaSourceCount",
        ],
      });
      return response.data.Items;
    },
    enabled: isOffline
      ? !!item.SeriesId
      : !!api && !!user?.Id && !!item.SeasonId,
  });

  const selectedSeasonId: string | null = useMemo(
    () =>
      seasons
        ?.find((season: any) => season.IndexNumber === seasonIndex)
        ?.Id?.toString() || null,
    [seasons, seasonIndex],
  );

  const { data: episodes, isLoading: episodesLoading } = useQuery({
    queryKey: ["episodes", item.SeriesId, selectedSeasonId],
    queryFn: async () => {
      if (isOffline) {
        if (!item.SeriesId || typeof seasonIndex !== "number") return [];
        return getDownloadedEpisodesForSeason(
          getDownloadedItems(),
          item.SeriesId,
          seasonIndex,
        );
      }
      if (!api || !user?.Id || !item.Id || !selectedSeasonId) return [];
      const res = await getTvShowsApi(api).getEpisodes({
        seriesId: item.SeriesId || "",
        userId: user.Id,
        seasonId: selectedSeasonId || undefined,
        enableUserData: true,
        fields: ["MediaSources", "MediaStreams", "Overview"],
      });

      return res.data.Items;
    },
    enabled: !!api && !!user?.Id && !!selectedSeasonId,
  });

  const episodeById = useMemo(
    () => new Map((episodes ?? []).map((e: BaseItemDto) => [e.Id, e])),
    [episodes],
  );

  // The shared card plus the runtime line; the overview goes in the footer
  // because it is far longer than anything a card carries.
  const episodeCards = useMemo(() => {
    const base = buildItemCards(episodes ?? [], {
      api,
      kind: "wide",
      useEpisodePoster: true,
      selectedId: item.Id,
    });
    return base.map((card) => ({
      ...card,
      detail: runtimeTicksToSeconds(episodeById.get(card.id)?.RunTimeTicks),
    }));
  }, [episodes, api, item.Id, episodeById]);

  const slots = useMemo(
    () => ({
      overlay: (card: CardData) =>
        card.id === item.Id ? null : (
          <View
            pointerEvents='none'
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name='play-circle' size={40} color='white' />
          </View>
        ),
      footer: (card: CardData) => {
        const overview = episodeById.get(card.id)?.Overview;
        if (!overview) return null;
        return (
          <Text numberOfLines={7} className='text-xs text-neutral-500 mt-1'>
            {overview}
          </Text>
        );
      },
    }),
    [episodeById, item.Id],
  );

  const queryClient = useQueryClient();
  useEffect(() => {
    // Don't prefetch when offline - data is already local
    if (isOffline) return;

    for (const e of episodes || []) {
      queryClient.prefetchQuery({
        queryKey: ["item", e.Id],
        queryFn: async () => {
          if (!e.Id) return;
          const res = await getUserItemData({
            api,
            userId: user?.Id,
            itemId: e.Id,
          });
          return res;
        },
        staleTime: 60 * 5 * 1000,
      });
    }
  }, [episodes, isOffline]);

  return (
    <View
      style={{
        position: "absolute",
        backgroundColor: "black",
        height: "100%",
        width: "100%",
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View
        style={{ padding: HEADER_LAYOUT.CONTAINER_PADDING }}
        className='flex-row items-center z-10'
      >
        {seasons && seasons.length > 0 && !episodesLoading && episodes && (
          <SeasonDropdown
            item={item}
            seasons={seasons}
            state={seasonIndexState}
            onSelect={(season) => {
              setSeasonIndexState((prev) => ({
                ...prev,
                [item.ParentId ?? ""]: season.IndexNumber,
              }));
            }}
          />
        )}
        <TouchableOpacity
          onPress={async () => {
            close();
          }}
          className='aspect-square flex flex-col rounded-xl items-center justify-center p-2 ml-auto'
        >
          <Ionicons name='close' size={ICON_SIZES.HEADER} color='white' />
        </TouchableOpacity>
      </View>

      {!episodes || episodesLoading ? (
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <Loader />
        </View>
      ) : (
        <CardRow
          items={episodes}
          kind='wide'
          useEpisodePoster
          cards={episodeCards}
          // Everything but the episode playing is faded back, and the current
          // one is brought into view once the row has measured.
          selectedId={item.Id}
          scrollToId={item.Id}
          textPlacement='below'
          slots={slots}
          footerHeight={FOOTER_HEIGHT}
          // Deliberately not the shared navigation: the player swaps items with
          // router.setParams so the MPV surface is never remounted.
          onPressItem={goToItem}
        />
      )}
    </View>
  );
};
