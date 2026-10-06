import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useCallback } from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SyncPlayPanel } from "@/components/syncplay/SyncPlayPanel";
import useRouter from "@/hooks/useAppRouter";
import { useGlobalModal } from "@/providers/GlobalModalProvider";
import { tvSyncPlayModalAtom } from "@/utils/atoms/tvSyncPlayModal";
import { store } from "@/utils/store";
import type { SyncPlaySeed } from "@/utils/syncplay/types";

/**
 * Opens SyncPlay: a sheet on phones and tablets, and on TV a route that
 * looks like one, where anything modal has to be a route.
 */
export const useSyncPlaySheet = () => {
  const { showModal, hideModal } = useGlobalModal();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return useCallback(
    (seed?: SyncPlaySeed) => {
      if (Platform.isTV) {
        // Set before the push: the route reads it on its first render.
        store.set(tvSyncPlayModalAtom, seed ?? null);
        router.push("/(auth)/tv-syncplay-modal");
        return;
      }
      showModal(
        <BottomSheetScrollView
          keyboardShouldPersistTaps='handled'
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 24,
          }}
        >
          <SyncPlayPanel seed={seed} onClose={hideModal} />
        </BottomSheetScrollView>,
        // Dragging a queue row must reorder the queue, not move the sheet.
        { enableContentPanningGesture: false },
      );
    },
    [showModal, hideModal, router, insets.bottom],
  );
};
