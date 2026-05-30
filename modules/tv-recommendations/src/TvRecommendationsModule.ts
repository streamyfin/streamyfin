import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";
import type { TvRecommendationsModuleType } from "./TvRecommendations.types";

let TvRecommendationsModule: TvRecommendationsModuleType | null = null;

if (Platform.OS === "android" && Platform.isTV) {
  try {
    TvRecommendationsModule =
      requireNativeModule<TvRecommendationsModuleType>("TvRecommendations");
  } catch {
    TvRecommendationsModule = null;
  }
}

export function syncTvRecommendations(json: string): boolean {
  return TvRecommendationsModule?.syncRecommendations(json) ?? false;
}

export function clearTvRecommendations(): boolean {
  return TvRecommendationsModule?.clearRecommendations() ?? false;
}

export function refreshTvRecommendations(): boolean {
  return TvRecommendationsModule?.refreshRecommendations() ?? false;
}
