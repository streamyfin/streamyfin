import { Platform } from "react-native";

// Dummy exports for TV
const DummyOrientationLock = {
  DEFAULT: 0,
  ALL: 1,
  PORTRAIT: 2,
  PORTRAIT_UP: 3,
  PORTRAIT_DOWN: 4,
  LANDSCAPE: 5,
  LANDSCAPE_LEFT: 6,
  LANDSCAPE_RIGHT: 7,
};

const DummyOrientation = {
  UNKNOWN: 0,
  PORTRAIT_UP: 1,
  PORTRAIT_DOWN: 2,
  LANDSCAPE_LEFT: 3,
  LANDSCAPE_RIGHT: 4,
};

const dummyLockAsync = async () => {};
const dummyUnlockAsync = async () => {};
const dummyGetOrientationAsync = async () => DummyOrientation.UNKNOWN;
const dummyGetOrientationLockAsync = async () => DummyOrientationLock.DEFAULT;
const dummySupportsOrientationLockAsync = async () => false;

// Conditionally export based on platform
let ScreenOrientation: any;
if (!Platform.isTV) {
  ScreenOrientation = require("expo-screen-orientation");
}

export const OrientationLock = Platform.isTV
  ? DummyOrientationLock
  : ScreenOrientation?.OrientationLock;
export const Orientation = Platform.isTV
  ? DummyOrientation
  : ScreenOrientation?.Orientation;
export const lockAsync = Platform.isTV
  ? dummyLockAsync
  : ScreenOrientation?.lockAsync;
export const unlockAsync = Platform.isTV
  ? dummyUnlockAsync
  : ScreenOrientation?.unlockAsync;
export const getOrientationAsync = Platform.isTV
  ? dummyGetOrientationAsync
  : ScreenOrientation?.getOrientationAsync;
export const getOrientationLockAsync = Platform.isTV
  ? dummyGetOrientationLockAsync
  : ScreenOrientation?.getOrientationLockAsync;
export const supportsOrientationLockAsync = Platform.isTV
  ? dummySupportsOrientationLockAsync
  : ScreenOrientation?.supportsOrientationLockAsync;
export const lockPlatformAsync = Platform.isTV
  ? dummyLockAsync
  : ScreenOrientation?.lockPlatformAsync;
export const getPlatformLockAsync = Platform.isTV
  ? dummyGetOrientationLockAsync
  : ScreenOrientation?.getPlatformLockAsync;
export const addOrientationChangeListener = Platform.isTV
  ? () => ({ remove: () => {} })
  : ScreenOrientation?.addOrientationChangeListener;
export const removeOrientationChangeListener = Platform.isTV
  ? () => {}
  : ScreenOrientation?.removeOrientationChangeListener;
export const removeOrientationChangeListeners = Platform.isTV
  ? () => {}
  : ScreenOrientation?.removeOrientationChangeListeners;
