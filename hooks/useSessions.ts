import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useAtom } from "jotai";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { Alert } from "react-native";


interface useSessionsProps {
  refetchInterval: number;
}

export const useSessions = ({
  refetchInterval = 5 * 1000,
}: useSessionsProps) => {
  const [api] = useAtom(apiAtom);
  const { data, isLoading, error } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      if (!api) return null;
      const response = await getSessionApi(api).getSessions();
      return response.data.filter((s) => s.NowPlayingItem);
    },
    refetchInterval: refetchInterval,
    //cacheTime: 0
  });

  return { sessions: data, isLoading }
};
