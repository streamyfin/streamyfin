import { useCallback, useRef } from "react";
import { Platform } from "react-native";

// Volume Manager type (since it's not exported from the library)
interface VolumeManager {
  getVolume(): Promise<{ volume: number }>;
  setVolume(volume: number): Promise<void>;
  showNativeVolumeUI(options: { enabled: boolean }): void;
}

// Brightness type
interface Brightness {
  getBrightnessAsync(): Promise<number>;
  setBrightnessAsync(brightness: number): Promise<void>;
}

// Dynamic imports for TV compatibility
const VolumeManager: VolumeManager | null = !Platform.isTV
  ? require("react-native-volume-manager")
  : null;
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

  const startVolumeDrag = useCallback(async (startY: number) => {
    if (Platform.isTV || !VolumeManager) return;

    try {
      const { volume } = await VolumeManager.getVolume();
      initialVolume.current = volume;
      dragStartY.current = startY;

      // Disable native volume UI during drag
      VolumeManager.showNativeVolumeUI({ enabled: false });
    } catch (error) {
      console.error("Error starting volume drag:", error);
    }
  }, []);

  const updateVolumeDrag = useCallback(
    async (deltaY: number) => {
      if (Platform.isTV || !VolumeManager || initialVolume.current === null)
        return;

      try {
        // Convert deltaY to volume change (negative deltaY = volume up)
        // More sensitive - easier to control
        const sensitivity = 0.006; // Doubled sensitivity for easier control
        const volumeChange = -deltaY * sensitivity;
        const newVolume = Math.max(
          0,
          Math.min(1, initialVolume.current + volumeChange),
        );

        await VolumeManager.setVolume(newVolume);
        const volumePercent = Math.round(newVolume * 100);
        onVolumeChange?.(volumePercent);
      } catch (error) {
        console.error("Error updating volume:", error);
      }
    },
    [onVolumeChange],
  );

  const endVolumeDrag = useCallback(() => {
    if (Platform.isTV || !VolumeManager) return;

    // Re-enable native volume UI
    setTimeout(() => {
      VolumeManager.showNativeVolumeUI({ enabled: true });
    }, 500);

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
