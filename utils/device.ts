import * as Crypto from "expo-crypto";
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
