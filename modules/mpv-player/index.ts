// Reexport the native module. On web, it will be resolved to MpvPlayerModule.web.ts
// and on native platforms to MpvPlayerModule.ts

export * from "./src/MpvPlayer.types";
export { default } from "./src/MpvPlayerModule";
export { default as MpvPlayerView } from "./src/MpvPlayerView";
// Presented native player (iOS only; module-level, no React view)
export * from "./src/NativePlayerPresentation";
export * from "./src/NativePlayerPresentation.types";
