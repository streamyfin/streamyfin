import { requireNativeView, requireOptionalNativeModule } from "expo";
import * as React from "react";
import { Platform } from "react-native";

import type { GlassCardRowViewProps } from "./GlassCardRow.types";

// The native view takes a single JSON string prop carrying the cards, the
// image headers and the card geometry. Typed object/array props are applied
// natively with `try? prop.set(...)`, so a conversion failure is swallowed and
// the view silently renders empty; a string prop has no such failure mode, and
// the same payload is what a future Android view would parse.
type NativeProps = {
  payload: string;
  onItemPress?: GlassCardRowViewProps["onItemPress"];
  onItemLongPress?: GlassCardRowViewProps["onItemLongPress"];
  onEndReached?: GlassCardRowViewProps["onEndReached"];
  style?: GlassCardRowViewProps["style"];
};

// Phones and tablets only: the TV home has its own focus-driven rows, and
// Android has no native implementation, so both keep the JS list.
//
// requireOptionalNativeModule returns null instead of throwing when the module
// isn't in this binary (an older build, or a platform without a native view).
let NativeGlassCardRowView: React.ComponentType<NativeProps> | null = null;

if (!Platform.isTV && requireOptionalNativeModule("GlassCardRow")) {
  try {
    NativeGlassCardRowView = requireNativeView<NativeProps>("GlassCardRow");
  } catch {
    // View manager missing despite the module being registered.
  }
}

/**
 * GlassCardRowView — one native horizontally scrolling row of media cards.
 *
 * The whole row is a single native view rather than a native card per cell, so
 * a JS list never has to host dozens of native children. Renders nothing on
 * platforms without a native implementation; check `isGlassCardRowAvailable()`
 * and fall back to the JS list there.
 */
const GlassCardRowView: React.FC<GlassCardRowViewProps> = ({
  items,
  imageHeaders,
  layout,
  loadingMore,
  scrollToId,
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
        loadingMore: loadingMore ?? false,
        scrollToId: scrollToId ?? null,
      }),
    [items, imageHeaders, layout, loadingMore, scrollToId],
  );

  if (!NativeGlassCardRowView) {
    return null;
  }

  return (
    <NativeGlassCardRowView
      payload={payload}
      onItemPress={onItemPress}
      onItemLongPress={onItemLongPress}
      onEndReached={onEndReached}
      style={style}
    />
  );
};

export const isGlassCardRowAvailable = () => NativeGlassCardRowView != null;

export default GlassCardRowView;
