import { useSettings } from "@/utils/atoms/settings";

/**
 * Whether cards should be drawn by the native view rather than in React
 * Native. Both renderers draw the same cards, so this only decides which one
 * runs — callers still have to check that a native view exists at all
 * (`isGlassCardRowAvailable` / `isGlassCardGridAvailable`).
 */
export function useNativeMediaCards(): boolean {
  const { settings } = useSettings();
  return settings?.nativeMediaCards !== false;
}
