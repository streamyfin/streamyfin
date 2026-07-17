import { useCallback } from "react";
import useRouter from "@/hooks/useAppRouter";
import { tvUserSwitchModalAtom } from "@/utils/atoms/tvUserSwitchModal";
import type {
  SavedServer,
  SavedServerAccount,
} from "@/utils/secureCredentials";
import { store } from "@/utils/store";

interface UseTVUserSwitchModalOptions {
  onAccountSelect: (account: SavedServerAccount) => void;
}

export function useTVUserSwitchModal() {
  const router = useRouter();

  const showUserSwitchModal = useCallback(
    (
      server: SavedServer,
      currentUserId: string,
      options: UseTVUserSwitchModalOptions,
    ) => {
      // Need at least 2 accounts (current + at least one other)
      if (server.accounts.length < 2) {
        return;
      }

      store.set(tvUserSwitchModalAtom, {
        serverUrl: server.address,
        serverName: server.name || server.address,
        accounts: server.accounts,
        currentUserId,
        onAccountSelect: options.onAccountSelect,
      });

      router.push("/(auth)/tv-user-switch-modal");
    },
    [router],
  );

  return { showUserSwitchModal };
}
