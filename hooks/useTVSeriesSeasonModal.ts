import { useCallback } from "react";
import useRouter from "@/hooks/useAppRouter";
import { tvSeriesSeasonModalAtom } from "@/utils/atoms/tvSeriesSeasonModal";
import { store } from "@/utils/store";

interface ShowSeasonModalParams {
  seasons: Array<{
    label: string;
    value: number;
    selected: boolean;
  }>;
  selectedSeasonIndex: number | string;
  itemId: string;
  onSeasonSelect: (seasonIndex: number) => void;
}

export const useTVSeriesSeasonModal = () => {
  const router = useRouter();

  const showSeasonModal = useCallback(
    (params: ShowSeasonModalParams) => {
      store.set(tvSeriesSeasonModalAtom, {
        seasons: params.seasons,
        selectedSeasonIndex: params.selectedSeasonIndex,
        itemId: params.itemId,
        onSeasonSelect: params.onSeasonSelect,
      });
      router.push("/(auth)/tv-series-season-modal");
    },
    [router],
  );

  return { showSeasonModal };
};
