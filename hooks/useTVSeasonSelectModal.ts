import { useCallback } from "react";
import useRouter from "@/hooks/useAppRouter";
import {
  type TVSeasonSelectModalState,
  tvSeasonSelectModalAtom,
} from "@/utils/atoms/tvSeasonSelectModal";
import { store } from "@/utils/store";

type ShowSeasonSelectModalParams = NonNullable<TVSeasonSelectModalState>;

export const useTVSeasonSelectModal = () => {
  const router = useRouter();

  const showSeasonSelectModal = useCallback(
    (params: ShowSeasonSelectModalParams) => {
      store.set(tvSeasonSelectModalAtom, params);
      router.push("/(auth)/tv-season-select-modal");
    },
    [router],
  );

  return { showSeasonSelectModal };
};
