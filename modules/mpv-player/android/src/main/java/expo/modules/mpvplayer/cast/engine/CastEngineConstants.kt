package expo.modules.mpvplayer.cast.engine

/**
 * Timings and sizes of the native Cast engine. constants/Cast.test.ts keeps the shared ones in
 * step with constants/Cast.ts.
 */
object CastEngineConstants {
    /** Same value as RECEIVER_LOAD_TIMEOUT_MS: the wait the JS sender gives a load before saying it did not start. */
    const val LOAD_TIMEOUT_MS: Long = 30_000L

    /** The chrome draws its progress from one position a second; the SDK's progress listener ticks at this pace. */
    const val PROGRESS_INTERVAL_MS: Long = 1_000L

    /** The receiver runs GET /Items and PlaybackInfo before the next item buffers; silence past this is an end. */
    const val NEXT_ITEM_WAIT_MS: Long = 15_000L

    /** Same value as RECEIVER_MAX_QUEUE_ITEMS: a Cast message is capped at 64 KB, so PlayLast pages a long queue. */
    const val MAX_QUEUE_ITEMS: Int = 100
}
