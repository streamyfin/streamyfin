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
  onAccountSelect: (account: SavedServerAccount) => void;
  onAddAccount: () => void;
  onDeleteAccount: (account: SavedServerAccount) => void;
}

export const useTVAccountSelectModal = () => {
  const router = useRouter();

  const showAccountSelectModal = useCallback(
    (params: ShowAccountSelectModalParams) => {
      store.set(tvAccountSelectModalAtom, {
        server: params.server,
        onAccountSelect: params.onAccountSelect,
        onAddAccount: params.onAddAccount,
        onDeleteAccount: params.onDeleteAccount,
      });
      router.push("/tv-account-select-modal");
    },
    [router],
  );

  return { showAccountSelectModal };
};
