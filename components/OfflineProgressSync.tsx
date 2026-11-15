import { useOfflineProgressSync } from "@/hooks/useOfflineProgressSync";

/** Mounts the offline watch progress sync for the whole app. */
export function OfflineProgressSync() {
  useOfflineProgressSync();
  return null;
}
