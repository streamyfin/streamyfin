import Foundation

/// Timings and sizes of the native Cast engine. constants/Cast.test.ts keeps the shared ones in
/// step with constants/Cast.ts.
enum CastEngineConstants {
  /// Same value as RECEIVER_LOAD_TIMEOUT_MS: the wait the JS sender gives a load before saying it did not start.
  static let loadTimeoutMs: Double = 30_000
  /// The chrome draws its progress from one position a second; the engine's own timer ticks at this pace.
  static let progressIntervalMs: Double = 1_000
  /// The receiver runs GET /Items and PlaybackInfo before the next item buffers; silence past this is an end.
  static let nextItemWaitMs: Double = 15_000
  /// Same value as RECEIVER_MAX_QUEUE_ITEMS: a Cast message is capped at 64 KB, so PlayLast pages a long queue.
  static let maxQueueItems = 100
  /// Past this far into an item, previous goes back to its start, as the chrome's chapterRestartThreshold does.
  static let previousRestartSeconds: Double = 3
}
