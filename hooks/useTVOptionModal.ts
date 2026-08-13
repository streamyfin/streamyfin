import { useCallback } from "react";
import useRouter from "@/hooks/useAppRouter";
import {
  type TVOptionItem,
  tvOptionModalAtom,
} from "@/utils/atoms/tvOptionModal";
import { store } from "@/utils/store";

interface ShowOptionsParams<T> {
  title: string;
  options: TVOptionItem<T>[];
  onSelect: (value: T) => void;
  cardWidth?: number;
  cardHeight?: number;
  deferApplyUntilDismissed?: boolean;
}

export const useTVOptionModal = () => {
  const router = useRouter();

  const showOptions = useCallback(
    <T>(params: ShowOptionsParams<T>) => {
      // Use store.set for synchronous update before navigation
      store.set(tvOptionModalAtom, {
        title: params.title,
        options: params.options,
        onSelect: params.onSelect,
        cardWidth: params.cardWidth,
        cardHeight: params.cardHeight,
        deferApplyUntilDismissed: params.deferApplyUntilDismissed,
      });
      router.push("/(auth)/tv-option-modal");
    },
    [router],
  );

  return { showOptions };
};
