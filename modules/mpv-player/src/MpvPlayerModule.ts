import { NativeModule, requireNativeModule } from "expo";

import { MpvPlayerModuleEvents } from "./MpvPlayer.types";

declare class MpvPlayerModule extends NativeModule<MpvPlayerModuleEvents> {
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<MpvPlayerModule>("MpvPlayer");
