import { storage } from "@/utils/mmkv";
import type { OfflineMutation } from "./types";

const MUTATION_QUEUE_KEY = "offline.mutation.queue.v1";

/**
 * Get the mutation queue from storage
 */
export function getMutationQueue(): OfflineMutation[] {
  const data = storage.getString(MUTATION_QUEUE_KEY);
  if (!data) return [];

  try {
    return JSON.parse(data) as OfflineMutation[];
  } catch (error) {
    console.error("[MutationQueue] Failed to parse queue:", error);
    return [];
  }
}

/**
 * Save the mutation queue to storage
 */
export function saveMutationQueue(queue: OfflineMutation[]): void {
  storage.set(MUTATION_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Add a mutation to the queue
 * Returns the mutation ID
 *
 * DEDUPLICATION LOGIC:
 * - Removes pending mutations of the same type+itemId before adding new one
 * - Prevents duplicate API calls when user rapidly clicks favorite/unfavorite
 * - Keeps failed mutations (they need retry) and successful mutations (cleanup happens elsewhere)
 */
export function addMutation(
  type: OfflineMutation["type"],
  itemId: string,
  payload: Record<string, any>,
): string {
  const queue = getMutationQueue();

  // Deduplicate: Remove older PENDING mutations of same type+itemId
  // Keep failed mutations (they need retry) and successful mutations (cleanup happens elsewhere)
  const deduped = queue.filter(
    (m) => !(m.type === type && m.itemId === itemId && m.status === "pending"),
  );

  const dedupedCount = queue.length - deduped.length;

  // Generate unique ID
  const id = `${type}_${itemId}_${Date.now()}`;

  const mutation: OfflineMutation = {
    id,
    type,
    itemId,
    timestamp: new Date().toISOString(),
    payload,
    retryCount: 0,
    status: "pending",
  };

  deduped.push(mutation);
  saveMutationQueue(deduped);

  if (dedupedCount > 0) {
    console.log(
      `[MutationQueue] Added ${type} for item ${itemId} (deduped ${dedupedCount} old mutation${dedupedCount > 1 ? "s" : ""})`,
    );
  } else {
  }

  return id;
}

/**
 * Update a mutation's status
 */
export function updateMutationStatus(
  mutationId: string,
  status: OfflineMutation["status"],
  error?: string,
): void {
  const queue = getMutationQueue();
  const mutation = queue.find((m) => m.id === mutationId);

  if (mutation) {
    mutation.status = status;
    if (error) {
      mutation.lastError = error;
    }
    if (status === "processing" || status === "failed") {
      mutation.retryCount += 1;
    }
    saveMutationQueue(queue);
  }
}

/**
 * Remove a mutation from the queue
 */
export function removeMutation(mutationId: string): void {
  const queue = getMutationQueue();
  const filteredQueue = queue.filter((m) => m.id !== mutationId);
  saveMutationQueue(filteredQueue);
}

/**
 * Get all pending mutations
 */
export function getPendingMutations(): OfflineMutation[] {
  return getMutationQueue().filter((m) => m.status === "pending");
}

/**
 * Get all failed mutations
 */
export function getFailedMutations(): OfflineMutation[] {
  return getMutationQueue().filter((m) => m.status === "failed");
}

/**
 * Clear all successful mutations from the queue
 */
export function clearSuccessfulMutations(): void {
  const queue = getMutationQueue();
  const filteredQueue = queue.filter((m) => m.status !== "success");
  saveMutationQueue(filteredQueue);
}

/**
 * Clear the entire mutation queue (use with caution)
 */
export function clearMutationQueue(): void {
  saveMutationQueue([]);
}

/**
 * Get mutation count by status
 */
export function getMutationCounts(): {
  total: number;
  pending: number;
  processing: number;
  success: number;
  failed: number;
} {
  const queue = getMutationQueue();
  return {
    total: queue.length,
    pending: queue.filter((m) => m.status === "pending").length,
    processing: queue.filter((m) => m.status === "processing").length,
    success: queue.filter((m) => m.status === "success").length,
    failed: queue.filter((m) => m.status === "failed").length,
  };
}
