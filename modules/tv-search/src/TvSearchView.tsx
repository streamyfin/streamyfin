import { requireNativeView } from "expo";
import * as React from "react";
import type { View } from "react-native";
import { Platform } from "react-native";

import type { TvSearchViewProps } from "./TvSearchView.types";

// The native TvSearchModule is Apple-only (tvOS SwiftUI `.searchable`).
// On Android the component is never rendered, but we must avoid calling
// `requireNativeView` at module-scope because it would crash on import.
const NativeView: React.ComponentType<
  TvSearchViewProps & React.RefAttributes<View>
> =
  Platform.OS === "ios"
    ? requireNativeView("TvSearchModule")
    : ((() => null) as any);

/**
 * Forwards its ref to the underlying native view so it can be used as a
 * `TVFocusGuideView` `destinations` target for routing focus into the native
 * search bar.
 */
const TvSearchView = React.forwardRef<View, TvSearchViewProps>((props, ref) => {
  return <NativeView ref={ref} {...props} />;
});

TvSearchView.displayName = "TvSearchView";

export default TvSearchView;
