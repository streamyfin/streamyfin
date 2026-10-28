import { viewStub } from "@/test-utils/viewStub";

/** `react-native-volume-manager`, answering with a fixed volume. */
const volumeApi = {
  getVolume: async () => ({ volume: 0.5 }),
  setVolume: async () => {},
  addVolumeListener: () => ({ remove: () => {} }),
  showNativeVolumeUI: () => {},
};

export const volumeManagerModule = {
  ...volumeApi,
  VolumeManager: volumeApi,
  default: volumeApi,
};

/** `expo-key-event`, which needs a native module and never fires here. */
export const keyEventModule = {
  useKeyEventListener: () => {},
};

/** `react-native-awesome-slider`, whose track is drawn natively. */
export const sliderModule = {
  Slider: viewStub("slider"),
};
