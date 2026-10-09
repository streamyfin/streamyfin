import { isNativePlayerSyncPlayAvailable } from "@/modules/mpv-player";
import {
  isNativePlayerSupported,
  isNativePlayerSupportedAndroidTV,
  isNativePlayerSupportedTV,
} from "@/utils/atoms/settings";

/**
 * SyncPlay plays in the presented native player only: its scheduler owns the
 * command deadlines. That player needs tvOS 26, so an older Apple TV gets no
 * SyncPlay at all instead of a group it can join and never play in.
 */
export const isSyncPlayAvailable = (): boolean =>
  (isNativePlayerSupported ||
    isNativePlayerSupportedTV ||
    isNativePlayerSupportedAndroidTV) &&
  isNativePlayerSyncPlayAvailable();
