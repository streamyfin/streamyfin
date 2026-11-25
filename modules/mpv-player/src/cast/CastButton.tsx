import { requireNativeView } from "expo";
import type React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { CastNative } from "./CastModule";
import { isCastAvailable } from "./cast";

export interface CastButtonProps {
  tintColor?: string;
  style?: StyleProp<ViewStyle>;
}

// The SDK's own button (GCKUICastButton, MediaRouteButton): it opens the
// system Cast dialog and shows the connection state. It stays until the
// output sheet of the remote playback work replaces it.
let NativeCastButton: React.ComponentType<CastButtonProps> | null = null;
try {
  NativeCastButton = CastNative
    ? requireNativeView<CastButtonProps>("StreamyfinCast")
    : null;
} catch {
  NativeCastButton = null;
}

export function CastButton(props: CastButtonProps) {
  if (!NativeCastButton || !isCastAvailable()) return null;
  return <NativeCastButton {...props} />;
}
