import type { Api } from "@jellyfin/sdk";
import {
  getPlaystateApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import {
  clearSuccessfulMutations,
  getMutationQueue,
  getPendingMutations,
  updateMutationStatus,
} from "./mutationQueue";
import type { OfflineMutation } from "./types";

const MAX_RETRIES = 3;

/**
 * Execute a single mutation against the Jellyfin API
 */
async function executeMutation(
  mutation: OfflineMutation,
  api: Api,
  userId: string,
): Promise<void> {
  const { type, itemId } = mutation;

  switch (type) {
    case "FAVORITE":
      await getUserLibraryApi(api).markFavoriteItem({
        userId,
        itemId,
      });
      break;

    case "UNFAVORITE":
      await getUserLibraryApi(api).unmarkFavoriteItem({
        userId,
        itemId,
      });
      break;

    case "MARK_PLAYED":
      await getPlaystateApi(api).markPlayedItem({
        userId,
        itemId,
        datePlayed: mutation.payload.datePlayed || new Date().toISOString(),
      });
      break;

    case "MARK_UNPLAYED":
      await getPlaystateApi(api).markUnplayedItem({
        userId,
        itemId,
      });
      break;

    case "PLAYBACK_PROGRESS":
      await getPlaystateApi(api).reportPlaybackProgress({
        playbackProgressInfo: {
          ItemId: itemId,
          PositionTicks: mutation.payload.positionTicks,
          IsPaused: mutation.payload.isPaused ?? false,
          PlayMethod: mutation.payload.playMethod ?? "DirectPlay",
        },
      });
      break;

    default:
      throw new Error(`Unknown mutation type: ${type}`);
  }
}

/**
 * Process a single mutation from the queue
 */
async function processMutation(
  mutation: OfflineMutation,
  api: Api,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  // Skip if already successful or exceeded max retries
  if (mutation.status === "success") {
    return { success: true };
  }

  if (mutation.retryCount >= MAX_RETRIES) {
    console.warn(
      `[Sync] Mutation ${mutation.id} exceeded max retries (${MAX_RETRIES})`,
    );
    updateMutationStatus(mutation.id, "failed", "Max retries exceeded");
    return { success: false, error: "Max retries exceeded" };
  }

  try {
    // Mark as processing
    updateMutationStatus(mutation.id, "processing");

    // Execute the mutation
    await executeMutation(mutation, api, userId);

    // Mark as successful
    updateMutationStatus(mutation.id, "success");

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[Sync] Failed to process mutation ${mutation.id}:`, error);

    // Mark as failed
    updateMutationStatus(mutation.id, "failed", errorMessage);

    return { success: false, error: errorMessage };
  }
}

/**
 * Process all pending mutations in the queue
 * Returns the number of successful and failed syncs
 *
 * @param api - Jellyfin API instance
 * @param userId - User ID for API calls
 * @param abortSignal - Optional signal to cancel sync mid-operation
 */
export async function processSyncQueue(
  api: Api | null,
  userId?: string,
  abortSignal?: AbortSignal,
): Promise<{ success: number; failed: number; skipped: number }> {
  if (!api || !userId) {
    console.warn("[Sync] Cannot sync - missing API or user ID");
    return { success: 0, failed: 0, skipped: 0 };
  }

  const pending = getPendingMutations();

  if (pending.length === 0) {
    return { success: 0, failed: 0, skipped: 0 };
  }

  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const mutation of pending) {
    // Check if sync was aborted
    if (abortSignal?.aborted) {
      console.log(
        `[Sync] Aborted by user - ${skippedCount + (pending.length - successCount - failedCount - skippedCount)} mutations skipped`,
      );
      skippedCount = pending.length - successCount - failedCount;
      break;
    }

    const result = await processMutation(mutation, api, userId);

    if (result.success) {
      successCount++;
    } else {
      failedCount++;
    }
  }

  // Clean up successful mutations
  if (successCount > 0) {
    clearSuccessfulMutations();
  }

  console.log(
    `[Sync] Completed: ${successCount} success, ${failedCount} failed, ${skippedCount} skipped`,
  );

  return { success: successCount, failed: failedCount, skipped: skippedCount };
}

/**
 * Get sync status information
 */
export function getSyncStatus(): {
  hasPendingMutations: boolean;
  pendingCount: number;
  totalCount: number;
  lastSyncTime?: Date;
} {
  const queue = getMutationQueue();
  const pending = getPendingMutations();

  return {
    hasPendingMutations: pending.length > 0,
    pendingCount: pending.length,
    totalCount: queue.length,
    // TODO: Track last sync time in MMKV
    lastSyncTime: undefined,
  };
}

/**
 * Check if a sync is needed
 */
export function isSyncNeeded(): boolean {
  const pending = getPendingMutations();
  return pending.length > 0;
}
