import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { TRANSCODE_PROGRESS_POLL_INTERVAL } from "@/constants/Playback";
import { apiAtom } from "@/providers/JellyfinProvider";
import {
  describeTranscodingProgress,
  pickTranscodingInfo,
  type TranscodingProgress,
} from "@/utils/jellyfin/transcodingProgress";

/**
 * How far along the server is with the transcode it runs for this device,
 * polled for as long as `enabled` holds. The server knows this only through
 * the device's own session, which any user may read.
 *
 * `itemId` is what is playing. It only keys the answer, so the next episode
 * starts empty instead of showing the last one's numbers until the next poll.
 */
export const useTranscodingProgress = (
  enabled: boolean,
  itemId?: string | null,
): TranscodingProgress | null => {
  const api = useAtomValue(apiAtom);
  const deviceId = api?.deviceInfo.id;

  const { data } = useQuery({
    queryKey: ["transcoding-progress", deviceId, itemId],
    queryFn: async () => {
      if (!api) return null;
      const response = await getSessionApi(api).getSessions({ deviceId });
      return describeTranscodingProgress(pickTranscodingInfo(response.data));
    },
    enabled: enabled && !!api && !!deviceId,
    refetchInterval: TRANSCODE_PROGRESS_POLL_INTERVAL,
    // The numbers are optional: a failed poll is retried by the next one.
    retry: false,
    // Dropped as soon as nobody polls, so the next transcode never opens on
    // the last one's percentage, and nothing is written to the persisted cache.
    gcTime: 0,
  });

  return enabled ? (data ?? null) : null;
};
