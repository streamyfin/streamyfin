import type { PublicSystemInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { getSystemApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { SERVER_INFO_STALE_TIME_MS } from "@/constants/Jellyfin";
import { apiAtom } from "@/providers/JellyfinProvider";

interface Options {
  /** False keeps this reader from asking; it still sees what is cached. */
  enabled?: boolean;
  /** How long the cached answer is good enough for this reader. */
  staleTime?: number;
}

/**
 * The Jellyfin server's version, undefined until it has answered. Same key
 * and shape as the other readers of the server's public info, so they share
 * one request.
 */
export const useServerVersion = ({
  enabled = true,
  staleTime = SERVER_INFO_STALE_TIME_MS,
}: Options = {}) => {
  const api = useAtomValue(apiAtom);

  const { data: serverInfo } = useQuery({
    queryKey: ["jellyfin", "serverInfo"],
    queryFn: async (): Promise<PublicSystemInfo | null> => {
      if (!api) return null;
      return (await getSystemApi(api).getPublicSystemInfo()).data;
    },
    enabled: !!api && enabled,
    staleTime,
  });

  return serverInfo?.Version;
};
