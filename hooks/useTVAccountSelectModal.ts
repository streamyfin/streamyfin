import { useCallback } from "react";
import useRouter from "@/hooks/useAppRouter";
import { tvAccountSelectModalAtom } from "@/utils/atoms/tvAccountSelectModal";
import type {
  SavedServer,
  SavedServerAccount,
} from "@/utils/secureCredentials";
import { store } from "@/utils/store";

interface ShowAccountSelectModalParams {
  server: SavedServer;
  onAccountAction: (account: SavedServerAccount) => void;
  onAddAccount: () => void;
  onDeleteServer: () => void;
}

export const useTVAccountSelectModal = () => {
  const router = useRouter();

  const showAccountSelectModal = useCallback(
    (params: ShowAccountSelectModalParams) => {
      store.set(tvAccountSelectModalAtom, {
        server: params.server,
        onAccountAction: params.onAccountAction,
        onAddAccount: params.onAddAccount,
        onDeleteServer: params.onDeleteServer,
      });
      router.push("/tv-account-select-modal");
    },
    [router],
  );

  return { showAccountSelectModal };
};
