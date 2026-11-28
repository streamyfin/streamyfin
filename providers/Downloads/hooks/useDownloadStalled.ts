import { useEffect, useState } from "react";
import { DOWNLOAD_STALL_AFTER_MS } from "@/constants/Downloads";
import type { JobStatus } from "@/providers/Downloads/types";

/**
 * Whether a running download has gone quiet. A stall sends no event, so nothing re-renders the
 * card and it would keep showing the last speed for as long as the stall lasts: only a timer can
 * notice. Holding the update it fired for, and not a flag, clears the stall on the next event.
 */
export function useDownloadStalled(process: JobStatus): boolean {
  // Until the first byte, quiet is counted from the start: a transcode the server is still
  // preparing sends nothing at all.
  const lastUpdate = (
    process.lastProgressUpdateTime ?? process.startTime
  )?.getTime();
  const isRunning = process.status === "downloading";
  const [stalledUpdate, setStalledUpdate] = useState<number>();

  useEffect(() => {
    if (!isRunning || lastUpdate === undefined) return;

    const timeout = setTimeout(
      () => setStalledUpdate(lastUpdate),
      lastUpdate + DOWNLOAD_STALL_AFTER_MS - Date.now(),
    );
    return () => clearTimeout(timeout);
  }, [isRunning, lastUpdate]);

  return isRunning && lastUpdate !== undefined && stalledUpdate === lastUpdate;
}
