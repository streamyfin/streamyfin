import { MMKV } from "react-native-mmkv";
import { storage } from "@/utils/mmkv";

declare module "react-native-mmkv" {
  interface MMKV {
    get<T>(key: string): T | undefined;
    setAny(key: string, value: unknown): void;
  }
}

// Add the augmentation methods directly to the MMKV instance
// We need to bind these methods to preserve the 'this' context
storage.get = function <T>(this: MMKV, key: string): T | undefined {
  try {
    const serializedItem = this.getString(key);
    if (!serializedItem) return undefined;
    return JSON.parse(serializedItem);
  } catch (error) {
    console.warn(`Failed to parse MMKV value for key "${key}":`, error);
    return undefined;
  }
};

storage.setAny = function (this: MMKV, key: string, value: unknown): void {
  try {
    if (value === undefined) {
      this.remove(key);
    } else {
      this.set(key, JSON.stringify(value));
    }
  } catch (error) {
    console.warn(`Failed to set MMKV value for key "${key}":`, error);
  }
};
