import * as ScreenOrientation from "expo-screen-orientation";
import { atom } from "jotai";

export const orientationAtom = atom<number>(
  ScreenOrientation.OrientationLock.PORTRAIT_UP
);
