package expo.modules.mpvplayer.cast.receiver

/** How a load ended. */
sealed interface ReceiverLoadOutcome {
    val wireName: String

    data object Loaded : ReceiverLoadOutcome {
        override val wireName = "loaded"
    }

    data class Failed(val error: ReceiverLoadError, val message: ReceiverMessage) : ReceiverLoadOutcome {
        override val wireName = "failed"
    }

    data object TimedOut : ReceiverLoadOutcome {
        override val wireName = "timed_out"
    }

    /** A newer load replaced this one before it settled. */
    data object Superseded : ReceiverLoadOutcome {
        override val wireName = "superseded"
    }
}

/**
 * Settles one PlayNow from what the receiver reports, the first event winning. Sending only means
 * the message left the phone: the load counts once the receiver has a media session for it under a
 * play session it did not have before (every load gets a new one, which tells a recast of the item
 * already playing from the media it replaces). The caller owns the clock and calls [timeOut].
 */
class ReceiverLoadTracker(request: ReceiverPlayRequest, private val previousPlaySessionId: String?) {
    private val sent = ReceiverProtocol.toReceiverRequest(request)
    private val itemId = sent.items.getOrNull(sent.startIndex ?: 0)?.id

    var outcome: ReceiverLoadOutcome? = null
        private set

    private fun settle(result: ReceiverLoadOutcome): ReceiverLoadOutcome? {
        if (outcome != null) return null
        outcome = result
        return result
    }

    /** [customData] is null when the media has none (another sender loaded it). */
    fun onMediaStatus(customData: ReceiverCustomData?, playerState: String?): ReceiverLoadOutcome? {
        if (customData == null || playerState == null) return null
        if (previousPlaySessionId != null && customData.playSessionId == previousPlaySessionId) return null
        val isThisLoad = itemId != null && customData.itemId == itemId && playerState != "idle"
        return if (isThisLoad) settle(ReceiverLoadOutcome.Loaded) else null
    }

    fun onMessage(message: ReceiverMessage): ReceiverLoadOutcome? {
        val error = ReceiverProtocol.loadErrorOf(message) ?: return null
        return settle(ReceiverLoadOutcome.Failed(error, message))
    }

    fun supersede(): ReceiverLoadOutcome? = settle(ReceiverLoadOutcome.Superseded)

    fun timeOut(): ReceiverLoadOutcome? = settle(ReceiverLoadOutcome.TimedOut)
}
