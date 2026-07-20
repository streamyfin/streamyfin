import * as Crypto from "expo-crypto";
import { storage } from "./mmkv";

export const getOrSetDeviceId = () => {
  let deviceId = storage.getString("deviceId");

  if (!deviceId) {
    deviceId = Crypto.randomUUID();
    storage.set("deviceId", deviceId);
  }

  return deviceId;
};

export const getDeviceId = () => {
  const deviceId = storage.getString("deviceId");

  return deviceId || null;
};
