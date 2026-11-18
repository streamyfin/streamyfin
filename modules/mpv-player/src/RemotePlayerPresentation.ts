import type { EventSubscription } from "expo-modules-core";
import { Platform } from "react-native";
import { NativePlayerNativeModule } from "./NativePlayerModule";
import { isRemotePlayerEvent } from "./NativePlayerPresentation";
import type { NativePlayerEvents } from "./NativePlayerPresentation.types";
import type {
  RemotePlayerFailure,
  RemotePlayerPresentConfig,
  RemotePlayerTint,
  RemoteTechnicalLine,
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
 * A new send while the remote screen is up: the whole config replaces the one it shows, in place, and its
 * failure goes. False when no remote screen is up, or where none opens.
 */
export const updateRemotePlayer = async (
  config: RemotePlayerPresentConfig,
): Promise<boolean> => {
  if (!isRemotePlayerAvailable() || !NativePlayerNativeModule) return false;
  return NativePlayerNativeModule.updateRemotePlayer(config);
};

/**
 * What the remote screen says of a send that failed, under the title, with Play here when `canPlayHere`;
 * null takes it away. It also goes as the TV loads or plays again.
 */
export const showRemotePlayerFailure = async (
  failure: RemotePlayerFailure | null,
): Promise<void> => {
  if (!isRemotePlayerAvailable() || !NativePlayerNativeModule) return;
  await NativePlayerNativeModule.showRemotePlayerFailure(failure);
};

/** The lines of the remote screen's technical info panel, what the TV plays; nothing where no remote screen opens. */
export const updateRemoteTechnicalInfo = async (
  lines: RemoteTechnicalLine[],
): Promise<void> => {
  if (!isRemotePlayerAvailable() || !NativePlayerNativeModule) return;
  await NativePlayerNativeModule.updateRemoteTechnicalInfo(lines);
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
