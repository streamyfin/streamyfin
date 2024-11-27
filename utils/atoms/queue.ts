import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { atom, useAtom } from "jotai";
import { useEffect } from "react";

export interface Job {
  id: string;
  item: BaseItemDto;
  execute: () => void | Promise<void>;
}

export const runningAtom = atom<boolean>(false);

export const queueAtom = atom<Job[]>([]);

export const queueActions = {
  enqueue: (queue: Job[], setQueue: (update: Job[]) => void, job: Job) => {
    const updatedQueue = [...queue, job];
    console.info("Enqueueing job", job, updatedQueue);
    setQueue(updatedQueue);
  },
  processJob: async (
    queue: Job[],
    setQueue: (update: Job[]) => void,
    setProcessing: (processing: boolean) => void
  ) => {
    const [job, ...rest] = queue;
    setQueue(rest);

    console.info("Processing job", job);

    setProcessing(true);

    // Excute the function assiociated with the job.
    await job.execute();

    console.info("Job done", job);

    setProcessing(false);
  },
  clear: (
    setQueue: (update: Job[]) => void,
    setProcessing: (processing: boolean) => void
  ) => {
    setQueue([]);
    setProcessing(false);
  },
};

export const useJobProcessor = () => {
  const [queue, setQueue] = useAtom(queueAtom);
  const [running, setRunning] = useAtom(runningAtom);

  useEffect(() => {
    if (queue.length > 0 && !running) {
      console.info("Processing queue", queue);
      queueActions.processJob(queue, setQueue, setRunning);
    }
  }, [queue, running, setQueue, setRunning]);
};
