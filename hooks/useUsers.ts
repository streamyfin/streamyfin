import { apiAtom } from "@/providers/JellyfinProvider";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";

export const useUsers = () => {
  const [api] = useAtom(apiAtom);

  return useQuery({
    queryKey: ["users"],
    queryFn: async (): Promise<UserDto[]> => {
      if (!api) return [];
      const res = await getUserApi(api).getUsers();
      return res.data ?? [];
    },
    enabled: !!api,
  });
};
