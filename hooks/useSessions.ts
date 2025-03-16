import { useQuery } from "@tanstack/react-query";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useAtom } from "jotai";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { userAtom } from "@/providers/JellyfinProvider";
import { Platform } from "react-native";
const Notifications = !Platform.isTV ? require("expo-notifications") : null;

export interface useSessionsProps {
  refetchInterval: number;
  activeWithinSeconds: number;
}

export const useSessions = ({ refetchInterval = 5 * 1000, activeWithinSeconds = 360 }: useSessionsProps) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const { data, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      if (!api || !user || !user.Policy?.IsAdministrator) {
        return [];
      }
      const response = await getSessionApi(api).getSessions({
        activeWithinSeconds: activeWithinSeconds,
      });
      
      const result = response.data
        .filter((s) => s.NowPlayingItem)
        .sort((a, b) => (b.NowPlayingItem?.Name ?? "").localeCompare(a.NowPlayingItem?.Name ?? ""));
      
      // Notifications.setBadgeCountAsync(result.length);
      return result
    },
    refetchInterval: refetchInterval,
  });

  return { sessions: data, isLoading };
};
