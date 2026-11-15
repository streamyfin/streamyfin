import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { autoBitrateOptions } from "@/utils/jellyfin/autoBitrateOptions";
import {
  detectBitrate,
  ensureNetworkKnown,
  lastDetection,
} from "@/utils/jellyfin/bitrateTest";

/**
 * What the Auto settings show and do, on the phone and on TV: the bitrate
 * Auto streams at from the server now (or why its last measure failed), and
 * a measure run on demand with the options set.
 */
export const useAutoBitrateMeasure = () => {
  const api = useAtomValue(apiAtom);
  const { settings } = useSettings();
  const [measuring, setMeasuring] = useState(false);
  // The detections live outside React: a finished measure re-renders by hand.
  const [, measured] = useReducer((count: number) => count + 1, 0);
  const ratio = settings?.autoBitrateRatio;
  const ttlMinutes = settings?.autoBitrateTtlMinutes;
  const floor = settings?.autoBitrateInNetworkMin;
  const options = useMemo(
    () =>
      autoBitrateOptions({
        autoBitrateRatio: ratio,
        autoBitrateTtlMinutes: ttlMinutes,
        autoBitrateInNetworkMin: floor,
      }),
    [ratio, ttlMinutes, floor],
  );

  // The measure shown is the network's, kept from an earlier launch too: it
  // shows once NetInfo has said which network the device is on.
  useEffect(() => {
    let mounted = true;
    void ensureNetworkKnown().then(() => {
      if (mounted) measured();
    });
    return () => {
      mounted = false;
    };
  }, []);

  const measure = useCallback(async () => {
    if (!api) return;
    setMeasuring(true);
    try {
      await detectBitrate(api, true, options);
    } catch {
      // Kept with the detection, which the last measure reads back.
    } finally {
      setMeasuring(false);
      measured();
    }
  }, [api, options]);

  return {
    last: api ? lastDetection(api, options) : {},
    measuring,
    measure,
  };
};
