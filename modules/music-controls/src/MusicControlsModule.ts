import { requireNativeModule } from "expo-modules-core";
import type { MusicControlsModuleType } from "./MusicControls.types";

const MusicControlsModule: MusicControlsModuleType =
  requireNativeModule("MusicControls");

export default MusicControlsModule;
