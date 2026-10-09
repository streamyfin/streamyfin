import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useCallback, useState } from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SyncPlayPanel } from "@/components/syncplay/SyncPlayPanel";
import useRouter from "@/hooks/useAppRouter";
import { useGlobalModal } from "@/providers/GlobalModalProvider";
import { tvSyncPlayModalAtom } from "@/utils/atoms/tvSyncPlayModal";
import { store } from "@/utils/store";
import type { SyncPlaySeed } from "@/utils/syncplay/types";

function SyncPlaySheetContent({
  seed,
  onClose,
  bottomInset,
}: {
  seed?: SyncPlaySeed;
  onClose: () => void;
  bottomInset: number;
}) {
  // The sheet stands still while a queue entry is dragged: on iOS its own
  // pan would otherwise take the drag and scroll instead.
  const [dragging, setDragging] = useState(false);
  return (
    <BottomSheetScrollView
      keyboardShouldPersistTaps='handled'
      scrollEnabled={!dragging}
      contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}
    >
      <SyncPlayPanel
        seed={seed}
        onClose={onClose}
        onQueueDragChange={setDragging}
      />
    </BottomSheetScrollView>
  );
}

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
        <SyncPlaySheetContent
          seed={seed}
          onClose={hideModal}
          bottomInset={insets.bottom}
        />,
        // Dragging a queue row must reorder the queue, not move the sheet.
        { enableContentPanningGesture: false },
      );
    },
    [showModal, hideModal, router, insets.bottom],
  );
};
