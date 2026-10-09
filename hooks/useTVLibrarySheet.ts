import { useCallback } from "react";
import useRouter from "@/hooks/useAppRouter";
import {
  type TVLibrarySheetState,
  tvLibrarySheetAtom,
} from "@/utils/atoms/tvLibrarySheet";
import { store } from "@/utils/store";

/** Opens the TV library sheet, a navigation based modal like every TV modal. */
export const useTVLibrarySheet = () => {
  const router = useRouter();

  const openSheet = useCallback(
    (sheet: NonNullable<TVLibrarySheetState>) => {
      // Set before navigating, so the route has its content on first render.
      store.set(tvLibrarySheetAtom, sheet);
      router.push("/(auth)/tv-library-sheet-modal");
    },
    [router],
  );

  return { openSheet };
};
