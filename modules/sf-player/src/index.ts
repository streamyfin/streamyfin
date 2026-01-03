import { requireNativeModule } from "expo-modules-core";

export * from "./SfPlayer.types";
export { default as SfPlayerView } from "./SfPlayerView";

// Module-level functions for global KSPlayer settings
const SfPlayerModule = requireNativeModule("SfPlayer");

export function setHardwareDecode(enabled: boolean): void {
  SfPlayerModule.setHardwareDecode(enabled);
}

export function getHardwareDecode(): boolean {
  return SfPlayerModule.getHardwareDecode();
}
