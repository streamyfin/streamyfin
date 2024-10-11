import { requireNativeViewManager } from "expo-modules-core";
import * as React from "react";

import { VlcPlayerViewProps } from "./VlcPlayer.types";

const NativeView: React.ComponentType<VlcPlayerViewProps> =
  requireNativeViewManager("VlcPlayer");

export default function VlcPlayerView(props: VlcPlayerViewProps) {
  return <NativeView {...props} />;
}
