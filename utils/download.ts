import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtom } from "jotai";
import useImageStorage from "@/hooks/useImageStorage";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrlById } from "@/utils/jellyfin/image/getPrimaryImageUrlById";
import { storage } from "@/utils/mmkv";

const useDownloadHelper = () => {
  const [api] = useAtom(apiAtom);
  const { saveImage } = useImageStorage();

  const saveSeriesPrimaryImage = async (item: BaseItemDto) => {
    if (
      item.Type === "Episode" &&
      item.SeriesId &&
      !storage.getString(item.SeriesId)
    ) {
      await saveImage(
        item.SeriesId,
        getPrimaryImageUrlById({ api, id: item.SeriesId }),
      );
    }
  };

  return { saveSeriesPrimaryImage };
};

export default useDownloadHelper;

/**
 * Estimates the download file size based on bitrate and video duration.
 * Used when transcoding at lower bitrates where final size is unknown.
 * Adds 10% overhead to account for container and metadata.
 *
 * @param bitrateValue - The bitrate in bits per second
 * @param runTimeTicks - The video duration in ticks (1 tick = 100 nanoseconds)
 * @returns Estimated file size in bytes (with 10% overhead), or undefined if duration is invalid
 */
export function estimateDownloadSize(
  bitrateValue: number,
  runTimeTicks?: number | null,
): number | undefined {
  if (!runTimeTicks || runTimeTicks <= 0) return undefined;

  // Convert ticks to seconds (1 tick = 100 nanoseconds)
  const durationSeconds = runTimeTicks / 10000000;

  // Calculate size in bytes: (bitrate * duration) / 8
  // Add 10% overhead for container and metadata
  const estimatedBytes = ((bitrateValue * durationSeconds) / 8) * 1.1;

  return Math.floor(estimatedBytes);
}
