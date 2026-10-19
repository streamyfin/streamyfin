import { useQuery } from "@tanstack/react-query";
import { useSeerr } from "@/hooks/useSeerr";
import type { PublicSettings } from "@/utils/seerr/types";

/**
 * What the Seerr server makes public, for the settings its request modal
 * reads: whether it shows the specials and takes a series a season at a time.
 * Undefined until it is known, and then Seerr's defaults apply.
 */
export const useSeerrPublicSettings = (): PublicSettings | undefined => {
  const { seerrApi } = useSeerr();

  const { data } = useQuery({
    // Per server: after signing in to another one, its own settings apply.
    queryKey: ["seerr", "settings", "public", seerrApi?.axios.defaults.baseURL],
    queryFn: async () => (await seerrApi?.publicSettings()) ?? null,
    enabled: !!seerrApi,
    staleTime: 10 * 60 * 1000,
  });

  return data ?? undefined;
};
