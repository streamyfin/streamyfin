import { useCallback } from "react";
import useRouter from "@/hooks/useAppRouter";
import { tvAccountActionModalAtom } from "@/utils/atoms/tvAccountActionModal";
import type {
  SavedServer,
  SavedServerAccount,
} from "@/utils/secureCredentials";
import { store } from "@/utils/store";

interface ShowAccountActionModalParams {
  server: SavedServer;
  account: SavedServerAccount;
  onLogin: () => void;
  onDelete: () => void;
}

export const useTVAccountActionModal = () => {
  const router = useRouter();

  const showAccountActionModal = useCallback(
    (params: ShowAccountActionModalParams) => {
      store.set(tvAccountActionModalAtom, {
        server: params.server,
        account: params.account,
        onLogin: params.onLogin,
        onDelete: params.onDelete,
      });
      router.push("/tv-account-action-modal");
    },
    [router],
  );

  return { showAccountActionModal };
};
