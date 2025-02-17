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
  refetchInterval = 4 * 1000,
}: useSessionsProps) => {
  const [api] = useAtom(apiAtom);
  const { sessions, isLoading, error } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      if (!api) return null;
      const response = await getSessionApi(api).getSessions();
      return response.data;
    },
    refetchInterval: refetchInterval,
    //cacheTime: 0
  });
  Alert.alert(JSON.stringify(sessions));
  return { sessions, isLoading }
};
