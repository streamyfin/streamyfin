import { findNodeHandle, type View } from "react-native";
import type { OutputPickerAnchor } from "@/modules/mpv-player/src/cast";

/** A view's frame in window coordinates, which the output sheet's popover points at; null without a view. */
export const measureInWindow = (
  view: View | null,
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
export const nativeTagOf = (view: View | null): number | null =>
  view ? findNodeHandle(view) : null;
