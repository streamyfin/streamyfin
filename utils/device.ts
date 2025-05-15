import uuid from "react-native-uuid";
import { storage } from "./mmkv";

export const getOrSetDeviceId = () => {
  let deviceId = storage.getString("deviceId");

  if (!deviceId) {
    deviceId = uuid.v4() as string;
    storage.set("deviceId", deviceId);
  }

  return deviceId;
};

export const getDeviceId = () => {
  const deviceId = storage.getString("deviceId");

  return deviceId || null;
};
