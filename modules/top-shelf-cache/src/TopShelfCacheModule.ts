import { NativeModule, requireNativeModule } from "expo";
import { Platform } from "react-native";
import type { TopShelfCacheModuleEvents } from "./TopShelfCache.types";

declare class TopShelfCacheModuleType extends NativeModule<TopShelfCacheModuleEvents> {
  writeCache(json: string, apiKey?: string): boolean;
  clearCache(): boolean;
}

let TopShelfCacheNativeModule: TopShelfCacheModuleType | null = null;

if (Platform.OS === "ios" && Platform.isTV) {
  try {
    TopShelfCacheNativeModule =
      requireNativeModule<TopShelfCacheModuleType>("TopShelfCache");
  } catch {
    TopShelfCacheNativeModule = null;
  }
}

export function writeTopShelfCache(json: string, apiKey?: string): boolean {
  if (!TopShelfCacheNativeModule) return false;

  try {
    return TopShelfCacheNativeModule.writeCache(json, apiKey);
  } catch {
    return TopShelfCacheNativeModule.writeCache(json);
  }
}

export function clearTopShelfCache(): boolean {
  return TopShelfCacheNativeModule?.clearCache() ?? false;
}
