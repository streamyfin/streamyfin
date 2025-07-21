import { MMKV } from "react-native-mmkv";

declare module "react-native-mmkv" {
  interface MMKV {
    get<T>(key: string): T | undefined;
    setAny(key: string, value: any | undefined): void;
  }
}

// Add the augmentation methods directly to the MMKV prototype
// This follows the recommended pattern while adding the helper methods your app uses
MMKV.prototype.get = function <T>(key: string): T | undefined {
  try {
    const serializedItem = this.getString(key);
    if (!serializedItem) return undefined;
    return JSON.parse(serializedItem);
  } catch (error) {
    console.warn(`Failed to parse MMKV value for key "${key}":`, error);
    return undefined;
  }
};

MMKV.prototype.setAny = function (key: string, value: any | undefined): void {
  try {
    if (value === undefined) {
      this.delete(key);
    } else {
      this.set(key, JSON.stringify(value));
    }
  } catch (error) {
    console.warn(`Failed to set MMKV value for key "${key}":`, error);
  }
};
