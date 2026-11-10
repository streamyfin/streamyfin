import { findNodeHandle, type ViewInstance } from "react-native";
import type { OutputPickerAnchor } from "@/modules/mpv-player/src/cast";

/** A view's frame in window coordinates, which the output sheet's popover points at; null without a view. */
export const measureInWindow = (
  view: ViewInstance | null,
): Promise<OutputPickerAnchor | null> =>
  new Promise((resolve) => {
    if (!view) {
      resolve(null);
      return;
    }
    view.measureInWindow((x, y, width, height) =>
      resolve({ x, y, width, height }),
    );
  });

/** A view's native tag, which the popover follows when the window turns or resizes; null without a view. */
export const nativeTagOf = (view: ViewInstance | null): number | null =>
  view ? (findNodeHandle(view) ?? null) : null;
