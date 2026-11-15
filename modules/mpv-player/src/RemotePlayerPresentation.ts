import type { EventSubscription } from "expo-modules-core";
import { Platform } from "react-native";
import { NativePlayerNativeModule } from "./NativePlayerModule";
import { isRemotePlayerEvent } from "./NativePlayerPresentation";
import type { NativePlayerEvents } from "./NativePlayerPresentation.types";
import type {
  RemotePlayerPresentConfig,
  RemotePlayerTint,
} from "./RemotePlayerPresentation.types";

/**
 * The remote player: the native chrome over the TV a Cast session drives, presented apart from the local
 * player. TVs do not cast, so it is never available there.
 */
export const isRemotePlayerAvailable = (): boolean =>
  !Platform.isTV &&
  typeof NativePlayerNativeModule?.presentRemotePlayer === "function";

/** Rejects where it is not available, and with the native refusal when no remote engine can drive the TV. */
export const presentRemotePlayer = (
  config: RemotePlayerPresentConfig,
): Promise<void> => {
  if (!isRemotePlayerAvailable() || !NativePlayerNativeModule) {
    return Promise.reject(
      new Error("The remote player is not available on this device"),
    );
  }
  return NativePlayerNativeModule.presentRemotePlayer(config);
};

/**
 * The background and active color of the remote screen once the artwork's color is known, faded in. Nothing
 * where no remote screen opens; a no-op natively when none is up.
 */
export const updateRemotePlayerTint = async (
  tint: RemotePlayerTint,
): Promise<void> => {
  if (!isRemotePlayerAvailable() || !NativePlayerNativeModule) return;
  await NativePlayerNativeModule.updateRemotePlayerTint(tint);
};

/**
 * Attach a listener to the remote player's events only: they share the local player's names, and each
 * body carries `remote: true`. Attach before presenting, as with the local player.
 */
export const addRemotePlayerListener = <K extends keyof NativePlayerEvents>(
  event: K,
  listener: NativePlayerEvents[K],
): EventSubscription | null =>
  NativePlayerNativeModule?.addListener(event, ((payload: unknown) => {
    if (!isRemotePlayerEvent(payload)) return;
    (listener as (value: unknown) => void)(payload);
  }) as NativePlayerEvents[K]) ?? null;
