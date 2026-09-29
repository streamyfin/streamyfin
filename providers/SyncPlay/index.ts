/**
 * SyncPlay — public exports.
 *
 * Only what external consumers (components, hooks, screens) need.
 * Internal modules (PlaybackCore, QueueCore, TimeSync, PlayerWrapper,
 * queueTranslation, EventEmitter, etc.) stay package-private.
 */

export { Controller as SyncPlayController } from "./Controller";
export { msToTicks, ticksToMs } from "./constants";
export { SyncPlayManager } from "./Manager";
export { SyncPlayProvider, useSyncPlay } from "./SyncPlayProvider";
export * from "./types";
