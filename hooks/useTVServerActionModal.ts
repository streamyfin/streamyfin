import { useCallback } from "react";
import useRouter from "@/hooks/useAppRouter";
import { tvServerActionModalAtom } from "@/utils/atoms/tvServerActionModal";
import type { SavedServer } from "@/utils/secureCredentials";
import { store } from "@/utils/store";

interface ShowServerActionModalParams {
  server: SavedServer;
  onLogin: () => void;
  onDelete: () => void;
}

export const useTVServerActionModal = () => {
  const router = useRouter();

  const showServerActionModal = useCallback(
    (params: ShowServerActionModalParams) => {
      store.set(tvServerActionModalAtom, {
        server: params.server,
        onLogin: params.onLogin,
        onDelete: params.onDelete,
      });
      router.push("/tv-server-action-modal");
    },
    [router],
  );

  return { showServerActionModal };
};
