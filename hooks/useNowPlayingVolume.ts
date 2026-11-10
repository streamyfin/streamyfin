import { useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import {
  addSystemVolumeListener,
  getSystemVolumeAsync,
  hideSystemVolumeIndicator,
  setSystemVolume,
} from "@/modules/system-volume";

/** The device volume, for the slider on the Now Playing screen. */
export const useNowPlayingVolume = (isCastConnected: boolean) => {
  const volume = useSharedValue(0);
  const isTv = Platform.isTV;

  useEffect(() => {
    if (isTv) return;
    let reported = false;
    getSystemVolumeAsync().then((current) => {
      // A change the listener reported is newer than this read.
      if (!reported) volume.value = current;
    });
    const subscription = addSystemVolumeListener((event) => {
      reported = true;
      volume.value = event.volume;
    });
    return () => {
      reported = true;
      subscription.remove();
    };
  }, [isTv, volume]);

  // The slider is the volume indicator on this screen. Not while casting: on
  // Android a hold takes the volume keys, and they must reach the system then,
  // which hands them to the Cast session.
  useEffect(() => {
    if (isTv || isCastConnected) return;
    return hideSystemVolumeIndicator();
  }, [isTv, isCastConnected]);

  const setVolume = useCallback((value: number) => {
    setSystemVolume(value);
  }, []);

  return { volume, setVolume };
};
