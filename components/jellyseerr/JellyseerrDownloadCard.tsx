import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import type { JellyseerrDownload } from "@/hooks/useJellyseerrDownloads";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import { formatTimeString } from "@/utils/time";

interface Props {
  download: JellyseerrDownload;
}

/**
 * One in-progress Radarr/Sonarr download: how far along it is, how much is
 * left and when it should land.
 */
export const JellyseerrDownloadCard: React.FC<Props> = ({ download }) => {
  const { jellyseerrApi, getTitle } = useJellyseerr();
  const { t } = useTranslation();

  // Same key as the rest of the app so the detail is fetched once and shared.
  const { data: details } = useQuery({
    queryKey: ["jellyseerr", "detail", download.mediaType, download.tmdbId],
    queryFn: async () =>
      download.mediaType === MediaType.MOVIE
        ? jellyseerrApi?.movieDetails(download.tmdbId)
        : jellyseerrApi?.tvDetails(download.tmdbId),
    enabled: !!jellyseerrApi && !!download.tmdbId,
  });

  const posterSrc = useMemo(
    () => jellyseerrApi?.imageProxy(details?.posterPath, "w300_and_h450_face"),
    [jellyseerrApi, details?.posterPath],
  );

  const title = useMemo(
    () => getTitle(details) || download.releaseTitle,
    [details, download.releaseTitle, getTitle],
  );

  // Sonarr queues one entry per episode, so name it rather than showing the
  // release name twice. A season pack collapses to one row, so show its range
  // instead of pretending it is the single episode that happened to be first.
  const subtitle = useMemo(() => {
    const { episode, episodeCount, firstEpisodeNumber, lastEpisodeNumber } =
      download;
    const season = episode?.seasonNumber;
    if (season === undefined) return download.releaseTitle;

    if (episodeCount > 1) {
      const pad = (n: number) => n.toString().padStart(2, "0");
      if (
        firstEpisodeNumber !== undefined &&
        lastEpisodeNumber !== undefined &&
        firstEpisodeNumber !== lastEpisodeNumber
      )
        return `S${season}E${pad(firstEpisodeNumber)}-E${pad(lastEpisodeNumber)}`;
      return `S${season} · ${t("jellyseerr.number_episodes", {
        episode_number: episodeCount,
      })}`;
    }

    const number =
      episode?.episodeNumber !== undefined
        ? `S${season}E${episode.episodeNumber}`
        : `S${season}`;
    return episode?.title ? `${number} · ${episode.title}` : number;
  }, [download, t]);

  const etaLabel = useMemo(() => {
    const completesAt = download.estimatedCompletionTime;
    if (completesAt) {
      const secondsRemaining = (completesAt.getTime() - Date.now()) / 1000;
      if (secondsRemaining > 0)
        return t("home.downloads.eta", {
          eta: formatTimeString(secondsRemaining, "s"),
        });
    }
    // timeLeft is a raw .NET TimeSpan passthrough — render it as-is rather
    // than guessing at its format.
    if (download.timeLeft)
      return t("home.downloads.eta", { eta: download.timeLeft });
    return t("jellyseerr.downloads.unknown_eta");
  }, [download.estimatedCompletionTime, download.timeLeft, t]);

  return (
    <View className='bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-4'>
      <View className='flex flex-row'>
        <View className='w-16 aspect-[10/15] rounded-lg overflow-hidden mr-4'>
          <Image
            source={{ uri: posterSrc }}
            cachePolicy='memory-disk'
            contentFit='cover'
            style={{ width: "100%", height: "100%" }}
          />
        </View>

        <View className='flex-1'>
          <Text numberOfLines={2} className='font-semibold'>
            {title}
          </Text>
          <Text numberOfLines={1} className='text-xs opacity-50'>
            {subtitle}
          </Text>

          <View className='flex flex-row items-center gap-x-2 mt-1 self-start'>
            <View className='bg-purple-600/20 px-2 py-0.5 rounded-md'>
              <Text className='text-xs text-purple-400'>{download.status}</Text>
            </View>
            {download.is4k && (
              <View className='bg-neutral-800 px-2 py-0.5 rounded-md'>
                <Text className='text-xs opacity-75'>4K</Text>
              </View>
            )}
          </View>

          <View className='flex flex-row items-center gap-x-2 mt-1.5'>
            <Text className='text-xs font-semibold'>
              {download.progress.toFixed(0)}%
            </Text>
            {download.size > 0 && (
              <Text className='text-xs opacity-75'>
                {download.downloaded.bytesToReadable()} /{" "}
                {download.size.bytesToReadable()}
              </Text>
            )}
          </View>

          <View className='bg-gray-800 h-1 rounded-full overflow-hidden mt-2'>
            <View
              className='bg-purple-600 h-full'
              style={{ width: `${download.progress}%` }}
            />
          </View>

          <Text className='text-xs text-green-400 mt-1'>{etaLabel}</Text>
        </View>
      </View>
    </View>
  );
};

export default JellyseerrDownloadCard;
