import { useQuery } from "@tanstack/react-query";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useAtom } from "jotai";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { userAtom } from "@/providers/JellyfinProvider";

export interface useSessionsProps {
  refetchInterval: number;
  activeWithinSeconds: number;
}

export const useSessions = ({
  refetchInterval = 5 * 1000,
  activeWithinSeconds = 360,
}: useSessionsProps) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const { data, isLoading, error } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      if (!api || !user || !user.Policy?.IsAdministrator) {
        return [];
      }
      const response = await getSessionApi(api).getSessions({
        activeWithinSeconds: activeWithinSeconds,
      });
      return response.data.filter((s) => s.NowPlayingItem);
    },
    refetchInterval: refetchInterval,
    //enabled: !!user || !!user.Policy?.IsAdministrator,
    //cacheTime: 0
  });

  return { sessions: data, isLoading };
};
