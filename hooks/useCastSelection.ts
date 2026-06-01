/**
 * Source of truth for the active cast track / quality / version selection.
 *
 * Truth = the CastSelection echoed back in the cast media customData. A local
 * `pending` selection is shown optimistically while a reload re-transcodes, then
 * cleared once the cast reports it (reconciled) or the reload fails.
 */

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useCallback, useEffect, useState } from "react";
import type { MediaStatus } from "react-native-google-cast";
import { resolveSelection, selectionsEqual } from "@/utils/casting/selection";
import type { CastSelection } from "@/utils/casting/types";

interface UseCastSelectionParams {
  currentItem: BaseItemDto | null;
  mediaStatus: MediaStatus | null | undefined;
  /** Reload the cast stream with the given selection. Resolves true on success. */
  reload: (selection: CastSelection) => Promise<boolean>;
}

interface UseCastSelectionResult {
  /** Effective selection: optimistic pending, else cast truth, else default. */
  currentSelection: CastSelection | null;
  /** Merge a partial selection, show it optimistically, and reload the stream. */
  applySelection: (partial: Partial<CastSelection>) => void;
}

export const useCastSelection = ({
  currentItem,
  mediaStatus,
  reload,
}: UseCastSelectionParams): UseCastSelectionResult => {
  const [pending, setPending] = useState<CastSelection | null>(null);

  // Truth: the selection the cast reports as loaded, via customData.
  const truth =
    (
      mediaStatus?.mediaInfo?.customData as
        | { selection?: CastSelection }
        | undefined
    )?.selection ?? null;

  const currentSelection: CastSelection | null =
    pending ??
    truth ??
    (currentItem ? resolveSelection(currentItem, {}) : null);

  // A new media item invalidates any pending selection from the previous one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item id only
  useEffect(() => {
    setPending(null);
  }, [currentItem?.Id]);

  // Reconcile: once the cast reports the pending selection as loaded, clear it.
  useEffect(() => {
    if (pending && truth && selectionsEqual(pending, truth)) {
      setPending(null);
    }
  }, [pending, truth]);

  const applySelection = useCallback(
    (partial: Partial<CastSelection>) => {
      if (!currentSelection) return;
      const next: CastSelection = { ...currentSelection, ...partial };
      setPending(next);
      reload(next).then((ok) => {
        if (!ok) setPending(null);
      });
    },
    [currentSelection, reload],
  );

  return { currentSelection, applySelection };
};
