import { type Dispatch, type SetStateAction, useCallback } from "react";
import type { ScaleFactor } from "../ScaleFactorSelector";
import type { AspectRatio } from "../VideoScalingModeSelector";

interface UseVideoScalingProps {
  setAspectRatio?: Dispatch<SetStateAction<AspectRatio>>;
  setScaleFactor?: Dispatch<SetStateAction<ScaleFactor>>;
  setVideoAspectRatio?: (aspectRatio: string | null) => Promise<void>;
  setVideoScaleFactor?: (scaleFactor: number) => Promise<void>;
}

export const useVideoScaling = ({
  setAspectRatio,
  setScaleFactor,
  setVideoAspectRatio,
  setVideoScaleFactor,
}: UseVideoScalingProps) => {
  const handleAspectRatioChange = useCallback(
    async (newRatio: AspectRatio) => {
      if (!setAspectRatio || !setVideoAspectRatio) return;

      setAspectRatio(newRatio);
      const aspectRatioString = newRatio === "default" ? null : newRatio;
      await setVideoAspectRatio(aspectRatioString);
    },
    [setAspectRatio, setVideoAspectRatio],
  );

  const handleScaleFactorChange = useCallback(
    async (newScale: ScaleFactor) => {
      if (!setScaleFactor || !setVideoScaleFactor) return;

      setScaleFactor(newScale);
      await setVideoScaleFactor(newScale);
    },
    [setScaleFactor, setVideoScaleFactor],
  );

  return {
    handleAspectRatioChange,
    handleScaleFactorChange,
  };
};
