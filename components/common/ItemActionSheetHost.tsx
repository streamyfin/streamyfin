import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useEffect, useRef } from "react";
import { useItemActionSheet } from "@/hooks/useItemActionSheet";

type Props = {
  item: BaseItemDto;
  onClose: () => void;
};

/**
 * Presents the item action sheet for as long as it is mounted, then calls
 * `onClose`. The sheet's hooks are bound to a single item, so a caller that
 * only knows which item was long-pressed at runtime — a native list handing
 * back an id — mounts this with `key={item.Id}` instead of rendering a
 * TouchableItemRouter per row.
 */
export const ItemActionSheetHost: React.FC<Props> = ({ item, onClose }) => {
  const showActionSheet = useItemActionSheet(item);
  // Present once per mount: the callback identity changes as the item's
  // favorite/played state settles, which must not re-open the sheet.
  const presented = useRef(false);

  useEffect(() => {
    if (presented.current) return;
    presented.current = true;

    let cancelled = false;
    showActionSheet().finally(() => {
      if (!cancelled) onClose();
    });

    return () => {
      cancelled = true;
    };
  }, [showActionSheet, onClose]);

  return null;
};
