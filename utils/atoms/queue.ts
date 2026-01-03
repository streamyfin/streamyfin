import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { atom, useAtom } from "jotai";
import { useEffect } from "react";
import { processesAtom } from "@/providers/DownloadProvider";
import { JobStatus } from "@/providers/Downloads/types";

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

const DEFAULT_CONCURRENT_LIMIT = 2;

export const useJobProcessor = () => {
  const [queue, setQueue] = useAtom(queueAtom);
  const [running, setRunning] = useAtom(runningAtom);
  const [processes] = useAtom<JobStatus[]>(processesAtom);

  useEffect(() => {
    if (
      !running &&
      queue.length > 0 &&
      processes.length < DEFAULT_CONCURRENT_LIMIT
    ) {
      console.info("Processing queue", queue);
      queueActions.processJob(queue, setQueue, setRunning);
    }
  }, [processes, queue, running, setQueue, setRunning]);
};
