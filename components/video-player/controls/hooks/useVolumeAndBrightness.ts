import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { VOLUME_SWIPE_INDICATOR_RELEASE_MS } from "@/constants/Playback";
import {
  getSystemVolumeAsync,
  hideSystemVolumeIndicator,
  setSystemVolume,
} from "@/modules/system-volume";

// Brightness type
interface Brightness {
  getBrightnessAsync(): Promise<number>;
  setBrightnessAsync(brightness: number): Promise<void>;
}

// Dynamic import for TV compatibility
const Brightness: Brightness | null = !Platform.isTV
  ? require("expo-brightness")
  : null;

interface UseVolumeAndBrightnessOptions {
  onVolumeChange?: (volume: number) => void;
  onBrightnessChange?: (brightness: number) => void;
}

export const useVolumeAndBrightness = ({
  onVolumeChange,
  onBrightnessChange,
}: UseVolumeAndBrightnessOptions = {}) => {
  const initialVolume = useRef<number | null>(null);
  const initialBrightness = useRef<number | null>(null);
  const dragStartY = useRef<number | null>(null);
  const brightnessSupported = useRef(true);
  const releaseVolumeIndicator = useRef<(() => void) | null>(null);
  // Bumped when a volume drag starts or ends, so a starting volume read that
  // lands after its drag ended is dropped.
  const volumeDrag = useRef(0);
  const mounted = useRef(true);

  // Picture in picture unmounts the controls mid-gesture, so the drag never
  // ends, and a hold left behind would keep the system indicator away, and on
  // Android the volume keys taken, for the life of the app.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      volumeDrag.current += 1;
      releaseVolumeIndicator.current?.();
      releaseVolumeIndicator.current = null;
    };
  }, []);

  const startVolumeDrag = useCallback(async (startY: number) => {
    // The drag starts on the next frame, which can come after an unmount.
    if (Platform.isTV || !mounted.current) return;

    const drag = ++volumeDrag.current;
    initialVolume.current = null;
    dragStartY.current = startY;

    // The gesture shows its own volume level.
    releaseVolumeIndicator.current?.();
    releaseVolumeIndicator.current = hideSystemVolumeIndicator();

    const volume = await getSystemVolumeAsync();
    if (drag === volumeDrag.current) initialVolume.current = volume;
  }, []);

  const updateVolumeDrag = useCallback(
    async (deltaY: number) => {
      if (Platform.isTV || initialVolume.current === null) return;

      // Convert deltaY to volume change (negative deltaY = volume up)
      // More sensitive - easier to control
      const sensitivity = 0.006; // Doubled sensitivity for easier control
      const volumeChange = -deltaY * sensitivity;
      const newVolume = Math.max(
        0,
        Math.min(1, initialVolume.current + volumeChange),
      );

      setSystemVolume(newVolume);
      const volumePercent = Math.round(newVolume * 100);
      onVolumeChange?.(volumePercent);
    },
    [onVolumeChange],
  );

  const endVolumeDrag = useCallback(() => {
    if (Platform.isTV) return;

    volumeDrag.current += 1;
    // Held a little longer, so the gesture's last change does not bring the
    // system indicator up as it ends.
    const release = releaseVolumeIndicator.current;
    releaseVolumeIndicator.current = null;
    if (release) setTimeout(release, VOLUME_SWIPE_INDICATOR_RELEASE_MS);

    initialVolume.current = null;
    dragStartY.current = null;
  }, []);

  const startBrightnessDrag = useCallback(async (startY: number) => {
    if (Platform.isTV || !Brightness || !brightnessSupported.current) return;

    try {
      const brightness = await Brightness.getBrightnessAsync();
      initialBrightness.current = brightness;
      dragStartY.current = startY;
    } catch (error) {
      console.warn("Brightness not supported on this device:", error);
      brightnessSupported.current = false;
    }
  }, []);

  const updateBrightnessDrag = useCallback(
    async (deltaY: number) => {
      if (
        Platform.isTV ||
        !Brightness ||
        initialBrightness.current === null ||
        !brightnessSupported.current
      )
        return;

      try {
        // Convert deltaY to brightness change (negative deltaY = brightness up)
        // More sensitive - easier to control
        const sensitivity = 0.004; // Doubled sensitivity for easier control
        const brightnessChange = -deltaY * sensitivity;
        const newBrightness = Math.max(
          0,
          Math.min(1, initialBrightness.current + brightnessChange),
        );

        await Brightness.setBrightnessAsync(newBrightness);
        const brightnessPercent = Math.round(newBrightness * 100);
        onBrightnessChange?.(brightnessPercent);
      } catch (error) {
        console.warn("Brightness not supported on this device:", error);
        brightnessSupported.current = false;
      }
    },
    [onBrightnessChange],
  );

  const endBrightnessDrag = useCallback(() => {
    initialBrightness.current = null;
    dragStartY.current = null;
  }, []);

  return {
    startVolumeDrag,
    updateVolumeDrag,
    endVolumeDrag,
    startBrightnessDrag,
    updateBrightnessDrag,
    endBrightnessDrag,
  };
};
