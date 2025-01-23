import {MMKV} from "react-native-mmkv";

declare module "react-native-mmkv" {
  interface MMKV {
    get<T>(key: string): T | undefined
    setAny(key: string, value: any | undefined): void
  }
}

MMKV.prototype.get = function <T> (key: string): T | undefined {
  const serializedItem = this.getString(key);
  return serializedItem ? JSON.parse(serializedItem) : undefined;
}

MMKV.prototype.setAny = function (key: string, value: any | undefined): void {
  this.set(key, JSON.stringify(value));
}