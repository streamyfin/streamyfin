import { atom } from "jotai";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";

export const orientationAtom = atom<number>(
  ScreenOrientation.OrientationLock.PORTRAIT_UP,
);
