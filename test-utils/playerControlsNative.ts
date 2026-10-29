import { viewStub } from "@/test-utils/viewStub";

/** `expo-key-event`, which needs a native module and never fires here. */
export const keyEventModule = {
  useKeyEventListener: () => {},
};

/** `react-native-awesome-slider`, whose track is drawn natively. */
export const sliderModule = {
  Slider: viewStub("slider"),
};
