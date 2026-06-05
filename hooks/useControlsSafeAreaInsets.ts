import {
  type EdgeInsets,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useSettings } from "@/utils/atoms/settings";

const ZERO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Returns safe-area insets to apply to in-player controls, honoring the
 * `safeAreaInControlsEnabled` user setting. When the setting is disabled,
 * returns zero insets so controls can sit flush against the screen edges.
 */
export const useControlsSafeAreaInsets = (): EdgeInsets => {
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  return settings.safeAreaInControlsEnabled ? insets : ZERO_INSETS;
};
