import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useAtomValue } from "jotai";
import { apiAtom } from "@/providers/JellyfinProvider";
import { isMenuLink, type MenuLink } from "@/utils/customLinks";

/**
 * The custom links the server's admin lists as `menuLinks` in the web config,
 * without the entries that cannot be drawn as a row. A server that lists none,
 * or has no web config at all, gives an empty list.
 */
export const useMenuLinks = () => {
  const api = useAtomValue(apiAtom);

  return useQuery({
    queryKey: ["menuLinks", api?.basePath],
    queryFn: async (): Promise<MenuLink[]> => {
      let response: { data?: { menuLinks?: unknown } };
      try {
        response = await api!.axiosInstance.get(
          `${api!.basePath}/web/config.json`,
        );
      } catch (error) {
        // A server with its web client turned off (hostwebclient=false, common
        // behind a reverse proxy) answers 404: no links, not a failure to
        // retry and report every time More opens.
        if (isAxiosError(error) && error.response?.status === 404) return [];
        throw error;
      }
      const links = response?.data?.menuLinks;
      return Array.isArray(links) ? links.filter(isMenuLink) : [];
    },
    enabled: Boolean(api),
  });
};
