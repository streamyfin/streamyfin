import { NativeModule, requireNativeModule } from "expo";

import { MpvPlayerModuleEvents } from "./MpvPlayer.types";

declare class MpvPlayerModule extends NativeModule<MpvPlayerModuleEvents> {
  hello(): string;
  setValueAsync(value: string): Promise<void>;
  /**
   * Whether this device has a hardware AV1 decoder (`VTIsHardwareDecodeSupported`).
   *
   * **iOS/tvOS only** — not implemented on Android. Prefer
   * `supportsAv1HardwareDecode` from `@/utils/profiles/codecSupport`, which
   * handles the platform and older-binary cases.
   */
  supportsAv1HardwareDecode(): boolean;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<MpvPlayerModule>("MpvPlayer");
