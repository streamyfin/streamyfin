import {
  NativeModulesProxy,
  EventEmitter,
  Subscription,
} from "expo-modules-core";

// Import the native module. On web, it will be resolved to VlcPlayer.web.ts
// and on native platforms to VlcPlayer.ts
import VlcPlayerModule from "./src/VlcPlayerModule";
import VlcPlayerView from "./src/VlcPlayerView";
import { ChangeEventPayload, VlcPlayerViewProps } from "./src/VlcPlayer.types";

// Get the native constant value.
export const PI = VlcPlayerModule.PI;

export function hello(): string {
  return VlcPlayerModule.hello();
}

export async function setValueAsync(value: string) {
  return await VlcPlayerModule.setValueAsync(value);
}

const emitter = new EventEmitter(
  VlcPlayerModule ?? NativeModulesProxy.VlcPlayer
);

export function addChangeListener(
  listener: (event: ChangeEventPayload) => void
): Subscription {
  return emitter.addListener<ChangeEventPayload>("onChange", listener);
}

export { VlcPlayerView, VlcPlayerViewProps, ChangeEventPayload };
