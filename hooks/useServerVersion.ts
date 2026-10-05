import type { PublicSystemInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { getSystemApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { SERVER_INFO_STALE_TIME_MS } from "@/constants/Jellyfin";
import { apiAtom } from "@/providers/JellyfinProvider";

/**
 * The Jellyfin server's version, undefined until it has answered. Same key
 * and shape as the other readers of the server's public info, so they share
 * one request.
 */
export const useServerVersion = () => {
  const api = useAtomValue(apiAtom);

  const { data: serverInfo } = useQuery({
    queryKey: ["jellyfin", "serverInfo"],
    queryFn: async (): Promise<PublicSystemInfo | null> => {
      if (!api) return null;
      return (await getSystemApi(api).getPublicSystemInfo()).data;
    },
    enabled: !!api,
    staleTime: SERVER_INFO_STALE_TIME_MS,
  });

  return serverInfo?.Version;
};
