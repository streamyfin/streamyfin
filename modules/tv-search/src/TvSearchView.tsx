import { requireNativeView } from "expo";
import * as React from "react";
import type { View } from "react-native";

import type { TvSearchViewProps } from "./TvSearchView.types";

const NativeView: React.ComponentType<
  TvSearchViewProps & React.RefAttributes<View>
> = requireNativeView("TvSearchModule");

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
