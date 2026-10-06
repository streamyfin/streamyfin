import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { type RefObject, useCallback, useEffect, useRef } from "react";

/**
 * Presents a BottomSheetModal while `open` is true and dismisses it when
 * `open` goes back to false. Returns the handler to pass to the modal's
 * `onDismiss`.
 *
 * The sheet is only dismissed while it is actually up. A modal told to dismiss
 * when it has nothing on screen, because it was never presented or because the
 * user already swiped it away, stays in the library's "dismissing" state with
 * nothing left to finish it, and from then on ignores every present(). A sheet
 * that mounts closed would never open, and one closed by a swipe would never
 * open again.
 */
export const useSheetOpenState = (
  sheetRef: RefObject<BottomSheetModal | null>,
  open: boolean,
) => {
  const presented = useRef(false);

  useEffect(() => {
    if (open) {
      if (!sheetRef.current) return;
      sheetRef.current.present();
      presented.current = true;
    } else if (presented.current) {
      sheetRef.current?.dismiss();
      presented.current = false;
    }
  }, [open, sheetRef]);

  // The modal reports every dismissal here, its own included. One that
  // already happened must not be asked for again when `open` follows.
  return useCallback(() => {
    presented.current = false;
  }, []);
};
