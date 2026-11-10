import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import { storage } from "./mmkv";

export const getOrSetDeviceId = () => {
  const existing = storage.getString("deviceId");
  if (existing) {
    return existing;
  }

  const deviceId = Crypto.randomUUID();
  storage.set("deviceId", deviceId);
  return deviceId;
};

export const getDeviceId = () => {
  const deviceId = storage.getString("deviceId");

  return deviceId || null;
};

/**
 * The name Jellyfin lists this device under. On Android 12 and older
 * expo-device reads only the Bluetooth name, without the
 * Settings.Global.DEVICE_NAME fallback react-native-device-info had, so a
 * device the owner named but without a Bluetooth name shows up under its
 * model. The owner's name comes through here as is once expo-device reads
 * that fallback itself.
 */
export const getDeviceName = (): string =>
  Device.deviceName ?? Device.modelName ?? "unknown";
