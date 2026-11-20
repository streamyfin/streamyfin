import { getUserViewApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { useSettings } from "@/utils/atoms/settings";

/**
 * Whether the app offers Live TV: the server has a Live TV library and the
 * user has not hidden it. Shares the user views query with the Library tab.
 */
export const useShowsLiveTV = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();

  const { data: userViews } = useQuery({
    queryKey: ["user-views", user?.Id],
    queryFn: async () => {
      const response = await getUserViewApi(api!).getUserViews({
        userId: user?.Id,
      });
      return response.data.Items || null;
    },
    enabled: !!api && !!user?.Id,
    staleTime: 60 * 1000,
  });

  const hasLiveTV =
    userViews?.some((view) => view.CollectionType === "livetv") ?? false;
  return hasLiveTV && settings?.showLiveTvTab !== false;
};
