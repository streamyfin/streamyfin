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

/**
 * The install-wide id every account shared before ids became per-account.
 * Tokens issued back then are only valid under it, and the active id no longer
 * stays put, so it is pinned on first use and never rewritten.
 */
export const getBaseDeviceId = () => {
  const existing = storage.getString("baseDeviceId");
  if (existing) return existing;

  const base = getOrSetDeviceId();
  storage.set("baseDeviceId", base);
  return base;
};

export const setActiveDeviceId = (deviceId: string) => {
  // Pin the legacy id before the active one moves off it.
  getBaseDeviceId();
  storage.set("deviceId", deviceId);
};

export const mintDeviceId = () => Crypto.randomUUID();

export const getDeviceId = () => {
  const deviceId = storage.getString("deviceId");

  return deviceId || null;
};
