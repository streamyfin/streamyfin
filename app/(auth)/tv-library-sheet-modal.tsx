import { useAtomValue } from "jotai";
import { useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { TVLibrarySheet } from "@/components/library/TVLibrarySheet";
import useRouter from "@/hooks/useAppRouter";
import { tvLibrarySheetAtom } from "@/utils/atoms/tvLibrarySheet";
import { tvLibrarySheetPlacement } from "@/utils/library/librarySheet";
import { store } from "@/utils/store";

// Covered by components/library/TVLibrarySheet.test.tsx.
export default function TVLibrarySheetModal() {
  const router = useRouter();
  const sheet = useAtomValue(tvLibrarySheetAtom);

  // However the route goes away, the page is told and the callbacks are let go.
  useEffect(
    () => () => {
      store.get(tvLibrarySheetAtom)?.onClose?.();
      store.set(tvLibrarySheetAtom, null);
    },
    [],
  );

  const close = useCallback(() => router.back(), [router]);

  if (!sheet) return null;

  return (
    <TVLibrarySheet
      sheet={sheet}
      placement={tvLibrarySheetPlacement(Platform.OS)}
      onClose={close}
    />
  );
}
