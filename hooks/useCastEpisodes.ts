import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto, UserDto } from "@jellyfin/sdk/lib/generated-client";
import { getTvShowsApi, getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useCallback, useEffect, useState } from "react";
import type { Device, RemoteMediaClient } from "react-native-google-cast";
import type { Settings } from "@/utils/atoms/settings";
import { loadCastMedia } from "@/utils/casting/castLoad";

interface UseCastEpisodesParams {
  api: Api | null;
  user: UserDto | null;
  currentItem: BaseItemDto | null;
  remoteMediaClient: RemoteMediaClient | null;
  castDevice: Device | null;
  settings: Settings;
}

interface UseCastEpisodesResult {
  episodes: BaseItemDto[];
  nextEpisode: BaseItemDto | null;
  seasonData: BaseItemDto | null;
  loadEpisode: (episode: BaseItemDto) => Promise<void>;
}

export function useCastEpisodes({
  api,
  user,
  currentItem,
  remoteMediaClient,
  castDevice,
  settings,
}: UseCastEpisodesParams): UseCastEpisodesResult {
  const [episodes, setEpisodes] = useState<BaseItemDto[]>([]);
  const [nextEpisode, setNextEpisode] = useState<BaseItemDto | null>(null);
  const [seasonData, setSeasonData] = useState<BaseItemDto | null>(null);

  // Load a different episode on the Chromecast
  const loadEpisode = useCallback(
    async (episode: BaseItemDto) => {
      if (!api || !user?.Id || !episode.Id || !remoteMediaClient) return;

      try {
        const startPositionMs =
          (episode.UserData?.PlaybackPositionTicks ?? 0) / 10000;

        const result = await loadCastMedia({
          client: remoteMediaClient,
          device: castDevice,
          api,
          item: episode,
          userId: user.Id,
          profileMode: settings.chromecastProfile,
          maxBitrateSetting: settings.chromecastMaxBitrate,
          options: { startPositionMs },
        });

        if (!result.ok) {
          console.error(
            "[Casting Player] Failed to load episode:",
            result.error,
          );
          return;
        }
      } catch (error) {
        console.error("[Casting Player] Failed to load episode:", error);
      }
    },
    [
      api,
      user?.Id,
      remoteMediaClient,
      castDevice,
      settings.chromecastProfile,
      settings.chromecastMaxBitrate,
    ],
  );

  // Fetch season data for season poster
  useEffect(() => {
    if (
      currentItem?.Type !== "Episode" ||
      !currentItem.SeasonId ||
      !api ||
      !user?.Id
    )
      return;

    const fetchSeasonData = async () => {
      try {
        const userLibraryApi = getUserLibraryApi(api);
        const response = await userLibraryApi.getItem({
          itemId: currentItem.SeasonId!,
          userId: user.Id!,
        });
        setSeasonData(response.data);
      } catch (error) {
        console.error("[Casting Player] Failed to fetch season data:", error);
        setSeasonData(null);
      }
    };

    fetchSeasonData();
  }, [currentItem?.Type, currentItem?.SeasonId, api, user?.Id]);

  // Fetch episodes for TV shows
  useEffect(() => {
    if (currentItem?.Type !== "Episode" || !currentItem.SeriesId || !api)
      return;

    const fetchEpisodes = async () => {
      try {
        const tvShowsApi = getTvShowsApi(api);
        // Fetch ALL episodes from ALL seasons by removing seasonId filter
        const response = await tvShowsApi.getEpisodes({
          seriesId: currentItem.SeriesId!,
          // Don't filter by seasonId - get all seasons
          userId: api.accessToken ? undefined : "",
        });

        const episodeList = response.data.Items || [];
        setEpisodes(episodeList);

        // Find next episode
        const currentIndex = episodeList.findIndex(
          (ep) => ep.Id === currentItem.Id,
        );
        if (currentIndex >= 0 && currentIndex < episodeList.length - 1) {
          setNextEpisode(episodeList[currentIndex + 1]);
        } else {
          setNextEpisode(null);
        }
      } catch (error) {
        console.error("Failed to fetch episodes:", error);
      }
    };

    fetchEpisodes();
  }, [
    currentItem?.Type,
    currentItem?.SeriesId,
    currentItem?.SeasonId,
    currentItem?.Id,
    api,
  ]);

  return { episodes, nextEpisode, seasonData, loadEpisode };
}
