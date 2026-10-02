import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { userAtom } from "@/providers/JellyfinProvider";
import {
  getTrackMemoryScope,
  rememberTrackSelectionFromRow,
} from "@/utils/seriesTrackMemory";

/** Bind shared track capture to the current authenticated account. */
export function useTrackSelectionMemory() {
  const memoryScope = getTrackMemoryScope(useAtomValue(userAtom));
  const rememberTrack = useCallback(
    (
      options: Omit<
        Parameters<typeof rememberTrackSelectionFromRow>[0],
        "memoryScope"
      >,
    ) => rememberTrackSelectionFromRow({ ...options, memoryScope }),
    [memoryScope],
  );
  return { memoryScope, rememberTrack };
}
