import { requireNativeView, requireOptionalNativeModule } from "expo";
import * as React from "react";
import { Platform } from "react-native";

import type { GlassCardGridViewProps } from "./GlassCardRow.types";

type NativeProps = {
  payload: string;
  onItemPress?: GlassCardGridViewProps["onItemPress"];
  onItemLongPress?: GlassCardGridViewProps["onItemLongPress"];
  onEndReached?: GlassCardGridViewProps["onEndReached"];
  style?: GlassCardGridViewProps["style"];
};

// Same availability rules as the row: phones and tablets only, and null when
// the module isn't in this binary.
let NativeGlassCardGridView: React.ComponentType<NativeProps> | null = null;

if (!Platform.isTV && requireOptionalNativeModule("GlassCardGrid")) {
  try {
    NativeGlassCardGridView = requireNativeView<NativeProps>("GlassCardGrid");
  } catch {
    // View manager missing despite the module being registered.
  }
}

/**
 * GlassCardGridView — the whole scrollable grid as a single native view.
 *
 * The cards are the same model the row uses; only the container differs. The
 * grid owns its vertical scrolling, so anything above it (a filter bar) stays
 * pinned in JS rather than scrolling away with the content.
 */
const GlassCardGridView: React.FC<GlassCardGridViewProps> = ({
  items,
  imageHeaders,
  layout,
  columns,
  loadingMore,
  contentInsetTop,
  contentInsetBottom,
  scrollToTopToken,
  onItemPress,
  onItemLongPress,
  onEndReached,
  style,
}) => {
  const payload = React.useMemo(
    () =>
      JSON.stringify({
        items,
        imageHeaders: imageHeaders ?? {},
        layout: layout ?? {},
        columns: columns ?? 3,
        loadingMore: loadingMore ?? false,
        contentInsetTop: contentInsetTop ?? 0,
        contentInsetBottom: contentInsetBottom ?? 0,
        scrollToTopToken: scrollToTopToken ?? null,
      }),
    [
      items,
      imageHeaders,
      layout,
      columns,
      loadingMore,
      contentInsetTop,
      contentInsetBottom,
      scrollToTopToken,
    ],
  );

  if (!NativeGlassCardGridView) {
    return null;
  }

  return (
    <NativeGlassCardGridView
      payload={payload}
      onItemPress={onItemPress}
      onItemLongPress={onItemLongPress}
      onEndReached={onEndReached}
      style={style}
    />
  );
};

export const isGlassCardGridAvailable = () => NativeGlassCardGridView != null;

export default GlassCardGridView;
