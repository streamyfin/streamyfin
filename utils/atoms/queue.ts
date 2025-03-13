import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { atom, useAtom } from "jotai";
import { useEffect } from "react";
import { JobStatus } from "@/utils/optimize-server";
import { processesAtom } from "@/providers/DownloadProvider";
import { useSettings } from "@/utils/atoms/settings";

export interface Job {
  id: string;
  item: BaseItemDto;
  execute: () => void | Promise<void>;
}

export const runningAtom = atom<boolean>(false);

export const queueAtom = atom<Job[]>([]);

export const queueActions = {
  enqueue: (queue: Job[], setQueue: (update: Job[]) => void, ...job: Job[]) => {
    const updatedQueue = [...queue, ...job];
    console.info("Enqueueing job", job, updatedQueue);
    setQueue(updatedQueue);
  },
  processJob: async (
    queue: Job[],
    setQueue: (update: Job[]) => void,
    setProcessing: (processing: boolean) => void,
  ) => {
    const [job, ...rest] = queue;

    console.info("Processing job", job);

    setProcessing(true);

    // Allow job to execute so that it gets added as a processes first BEFORE updating new queue
    try {
      await job.execute();
    } finally {
      setQueue(rest);
    }

    console.info("Job done", job);

    setProcessing(false);
  },
  clear: (
    setQueue: (update: Job[]) => void,
    setProcessing: (processing: boolean) => void,
  ) => {
    setQueue([]);
    setProcessing(false);
  },
};

export const useJobProcessor = () => {
  const [queue, setQueue] = useAtom(queueAtom);
  const [running, setRunning] = useAtom(runningAtom);
  const [processes] = useAtom<JobStatus[]>(processesAtom);
  const [settings] = useSettings();

  useEffect(() => {
    if (
      !running &&
      queue.length > 0 &&
      settings &&
      processes.length < settings?.remuxConcurrentLimit
    ) {
      console.info("Processing queue", queue);
      queueActions.processJob(queue, setQueue, setRunning);
    }
  }, [processes, queue, running, setQueue, setRunning]);
};
