import * as Crypto from "expo-crypto";
import { storage } from "./mmkv";

// Holds the ACTIVE account's device id, rewritten on every login and account
// switch, so callers should read it rather than cache it.
export const getOrSetDeviceId = () => {
  const existing = storage.getString("deviceId");
  if (existing) {
    return existing;
  }

  const deviceId = Crypto.randomUUID();
  storage.set("deviceId", deviceId);
  return deviceId;
};

export const setActiveDeviceId = (deviceId: string) => {
  storage.set("deviceId", deviceId);
};

export const mintDeviceId = () => Crypto.randomUUID();

export const getDeviceId = () => {
  const deviceId = storage.getString("deviceId");

  return deviceId || null;
};
