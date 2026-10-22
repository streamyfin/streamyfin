import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { markExpectedError } from "@/utils/errors";

type Options = {
  /**
   * Whether each write carries the ones before it, as a write that replaces everything does.
   * An earlier write that fails is then left to the later one; otherwise each failure is said.
   */
  laterCarriesEarlier: boolean;
  /** Says a write failed. */
  onFailure: (error: unknown) => void;
  /** An answer the server gives on purpose, which is not reported as a defect. */
  expected?: (error: unknown) => boolean;
};

/**
 * Optimistic writes to data the server answers in full after each one. They go one at a time,
 * in the order they were made, through a mutation scope. A read on its way is dropped when a
 * write starts, since it answers with the state from before. An answer is shown once no write
 * waits behind it, since an earlier one lacks the changes still waiting. When the last write
 * fails, the data goes back to what the server last said, and is read again.
 */
export const useOrderedWrites = <T>(
  key: readonly unknown[],
  { laterCarriesEarlier, onFailure, expected }: Options,
) => {
  const queryClient = useQueryClient();
  // What the server last said while writes are on their way.
  const confirmed = useRef<T | undefined>(undefined);

  const run = useMutation({
    mutationKey: key,
    scope: { id: key.join(" ") },
    mutationFn: async (change: () => Promise<T>) => {
      try {
        return await change();
      } catch (error) {
        throw expected?.(error) ? markExpectedError(error) : error;
      }
    },
  });

  // The writes sent or waiting their turn; one that was answered no longer counts.
  const waiting = () => queryClient.isMutating({ mutationKey: key });

  return async (
    optimistic: ((current: T | undefined) => T) | undefined,
    change: () => Promise<T>,
  ): Promise<void> => {
    await queryClient.cancelQueries({ queryKey: key });
    if (waiting() === 0) confirmed.current = queryClient.getQueryData<T>(key);
    if (optimistic) queryClient.setQueryData<T>(key, optimistic);
    try {
      const saved = await run.mutateAsync(change);
      confirmed.current = saved;
      if (waiting() === 0) queryClient.setQueryData(key, saved);
    } catch (error) {
      if (waiting() > 0) {
        // The later write's answer shows what the server has.
        if (!laterCarriesEarlier) onFailure(error);
        return;
      }
      queryClient.setQueryData(key, confirmed.current);
      onFailure(error);
      // The server may have kept part of it, so what it has decides, and the snapshot only
      // stands in until it answers.
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };
};
