import { getDeviceName } from "@/utils/device";

const mockDevice: { deviceName: string | null; modelName: string | null } = {
  deviceName: null,
  modelName: null,
};
jest.mock("expo-device", () => ({
  get deviceName() {
    return mockDevice.deviceName;
  },
  get modelName() {
    return mockDevice.modelName;
  },
}));
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

describe("getDeviceName", () => {
  beforeEach(() => {
    mockDevice.deviceName = null;
    mockDevice.modelName = null;
  });

  // The model is there on every device, so this order is what lets the
  // owner's name through. On Android 12 and older expo-device does not yet
  // read Settings.Global.DEVICE_NAME; once it does, the name arrives as
  // deviceName and needs no change here.
  test("prefers the name the device's owner gave it to the model", () => {
    mockDevice.deviceName = "Living room TV";
    mockDevice.modelName = "SHIELD Android TV";

    expect(getDeviceName()).toBe("Living room TV");
  });

  // Android 12 and older give only the Bluetooth name, which a device without
  // Bluetooth does not have.
  test("is the model when the system gives no name", () => {
    mockDevice.modelName = "SHIELD Android TV";

    expect(getDeviceName()).toBe("SHIELD Android TV");
  });

  test("never sends Jellyfin an empty name", () => {
    expect(getDeviceName()).toBe("unknown");
  });
});
