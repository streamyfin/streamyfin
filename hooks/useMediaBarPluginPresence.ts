import type { PluginInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { getPluginsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { apiAtom } from "@/providers/JellyfinProvider";

const isMediaBarPlugin = (plugin: PluginInfo): boolean => {
  const values = [plugin.Name, plugin.Id, plugin.ConfigurationFileName]
    .filter((value) => typeof value === "string")
    .map((value) => value.toLowerCase());

  return values.some(
    (value) =>
      value.includes("media bar") ||
      value.includes("mediabar") ||
      value.includes("media-bar"),
  );
};

export const useMediaBarPluginPresence = () => {
  const api = useAtomValue(apiAtom);

  return useQuery({
    queryKey: ["plugin-presence", "media-bar", api?.basePath],
    queryFn: async (): Promise<boolean> => {
      if (!api) return false;

      try {
        const response = await getPluginsApi(api).getPlugins();
        const plugins = response.data ?? [];

        return plugins.some(isMediaBarPlugin);
      } catch (_error) {
        return false;
      }
    },
    enabled: !!api,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
};
