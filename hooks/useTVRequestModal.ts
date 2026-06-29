import { useCallback } from "react";
import useRouter from "@/hooks/useAppRouter";
import { tvRequestModalAtom } from "@/utils/atoms/tvRequestModal";
import type { MediaType } from "@/utils/jellyseerr/server/constants/media";
import type { MediaRequestBody } from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";
import { store } from "@/utils/store";

interface ShowRequestModalParams {
  requestBody: MediaRequestBody;
  title: string;
  id: number;
  mediaType: MediaType;
  onRequested: () => void;
  /**
   * Replace the current route instead of pushing. Use when opening the request
   * modal from another modal (e.g. the season selector) so the new sheet takes
   * its place rather than stacking on top of it (which breaks TV focus).
   */
  replace?: boolean;
}

export const useTVRequestModal = () => {
  const router = useRouter();

  const showRequestModal = useCallback(
    (params: ShowRequestModalParams) => {
      store.set(tvRequestModalAtom, {
        requestBody: params.requestBody,
        title: params.title,
        id: params.id,
        mediaType: params.mediaType,
        onRequested: params.onRequested,
      });
      if (params.replace) {
        router.replace("/(auth)/tv-request-modal");
      } else {
        router.push("/(auth)/tv-request-modal");
      }
    },
    [router],
  );

  return { showRequestModal };
};
