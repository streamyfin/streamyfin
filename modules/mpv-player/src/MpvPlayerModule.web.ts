import { NativeModule, registerWebModule } from "expo";

import { ChangeEventPayload } from "./MpvPlayer.types";

type MpvPlayerModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
};

class MpvPlayerModule extends NativeModule<MpvPlayerModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit("onChange", { value });
  }
  hello() {
    return "Hello world! 👋";
  }
}

export default registerWebModule(MpvPlayerModule, "MpvPlayerModule");
