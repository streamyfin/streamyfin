package expo.modules.mpvplayer.nativeplayer.remote

/**
 * The body of an event a remote screen emits, marked: JS's local player listeners skip it, and only the
 * remote player's hear it, so the local player never reports a playback that is not its own.
 */
fun markRemote(body: Map<String, Any?>): Map<String, Any?> = body + ("remote" to true)
