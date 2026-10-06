import { useCallback } from "react";
import useRouter from "@/hooks/useAppRouter";
import {
  type TVIssueModalState,
  tvIssueModalAtom,
} from "@/utils/atoms/tvIssueModal";
import { store } from "@/utils/store";

/** Opens the TV's report issue sheet for a title. */
export const useTVIssueModal = () => {
  const router = useRouter();

  const showIssueModal = useCallback(
    (params: NonNullable<TVIssueModalState>) => {
      store.set(tvIssueModalAtom, params);
      router.push("/(auth)/tv-issue-modal");
    },
    [router],
  );

  return { showIssueModal };
};
